import { renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { createGmailOAuthState, storeGmailOAuthReturnContext } from '@/lib/gmailOAuth';
import { useGmailOAuth } from '../useGmailOAuth';

// R2-COM-009 — retorno OAuth do Gmail só pode disparar a troca do `code`
// quando o `state` está presente e vinculado a esta sessão (nonce conferido).
// Retorno sem state, com state adulterado ou em sessão que não iniciou a
// conexão tem de abortar ANTES de chamar a edge function.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const USER = { id: 'user-1' } as User;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function renderOAuthReturn() {
  const setCurrentView = vi.fn();
  renderHook(() => useGmailOAuth(USER, false, setCurrentView), { wrapper: wrapper() });
  return { setCurrentView };
}

describe('useGmailOAuth — proteção CSRF do retorno (RFC 6749 §10.12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { success: true }, error: null } as never);
  });

  it('retorno legítimo troca o code enviando o state para a edge validar', async () => {
    const state = createGmailOAuthState({ view: 'integrations', integrationView: 'gmail' });
    window.history.replaceState(null, '', `/?code=code-ok&state=${encodeURIComponent(state)}`);

    renderOAuthReturn();

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));
    expect(supabase.functions.invoke).toHaveBeenCalledWith('gmail-oauth', expect.objectContaining({
      body: { action: 'exchange-code', code: 'code-ok', state },
    }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Gmail conectado com sucesso!'));
  });

  it('retorno SEM state não troca o code', async () => {
    window.history.replaceState(null, '', '/?code=code-solto');

    renderOAuthReturn();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('retorno com nonce divergente não troca o code', async () => {
    createGmailOAuthState({ view: 'integrations' }); // nonce real desta sessão
    const forged = JSON.stringify({ view: 'integrations', nonce: 'nonce-forjado' });
    window.history.replaceState(null, '', `/?code=code-x&state=${encodeURIComponent(forged)}`);

    renderOAuthReturn();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('retorno em sessão que nunca iniciou a conexão não troca o code', async () => {
    // Sem createGmailOAuthState: não há nonce armazenado — state bem formado não basta.
    const state = JSON.stringify({ view: 'integrations', nonce: 'nonce-externo' });
    window.history.replaceState(null, '', `/?code=code-y&state=${encodeURIComponent(state)}`);

    renderOAuthReturn();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('replay do mesmo retorno não troca o code uma segunda vez', async () => {
    const state = createGmailOAuthState({ view: 'integrations' });
    const url = `/?code=code-ok&state=${encodeURIComponent(state)}`;

    window.history.replaceState(null, '', url);
    renderOAuthReturn();
    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalledTimes(1));

    // O MESMO retorno chega de novo (botão voltar restaurando a URL de callback
    // ou link reenviado): o nonce já foi consumido pelo primeiro parse — o
    // replay aborta no cliente antes de chamar a edge.
    window.history.replaceState(null, '', url);
    renderOAuthReturn();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  });
});

// E10 (fusão Quadro→Tarefas): a rota `pipeline` deixou de ser uma porta de
// entrada do menu (o Quadro vive dentro de Tarefas). Um retorno de OAuth que
// ainda carregue `view=pipeline` no state NÃO pode reabrir a rota antiga: cai
// na view de fallback `integrations`.
describe('useGmailOAuth — views válidas do retorno (E10)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { success: true }, error: null } as never);
  });

  it('retorno com view=pipeline cai em integrations', async () => {
    const state = createGmailOAuthState({ view: 'pipeline', integrationView: 'gmail' });
    window.history.replaceState(null, '', `/?code=code-ok&state=${encodeURIComponent(state)}`);

    const { setCurrentView } = renderOAuthReturn();

    await waitFor(() => expect(setCurrentView).toHaveBeenCalledWith('integrations'));
    expect(setCurrentView).not.toHaveBeenCalledWith('pipeline');
  });

  it('retorno de erro com a rota guardada em pipeline também cai em integrations', async () => {
    // Canal do contexto guardado (sessionStorage): é a view usada quando o
    // retorno do Google chega sem state (cancelamento). O filtro tem de valer aqui também.
    storeGmailOAuthReturnContext('pipeline', 'gmail');
    window.history.replaceState(null, '', '/?error=access_denied');

    const { setCurrentView } = renderOAuthReturn();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Conexão com Gmail cancelada.'));
    expect(setCurrentView).toHaveBeenCalledWith('integrations');
    expect(setCurrentView).not.toHaveBeenCalledWith('pipeline');
  });

  it('as demais views do retorno continuam preservadas', async () => {
    const state = createGmailOAuthState({ view: 'omni-inbox', integrationView: 'gmail' });
    window.history.replaceState(null, '', `/?code=code-ok&state=${encodeURIComponent(state)}`);

    const { setCurrentView } = renderOAuthReturn();

    await waitFor(() => expect(setCurrentView).toHaveBeenCalledWith('omni-inbox'));
  });
});
