import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// --- mocks -----------------------------------------------------------------
// O componente importa o cliente real do Supabase (URL/anon key de producao no
// codigo). Mock obrigatorio: a guarda de rede de src/test/setup.ts recusa
// qualquer chamada real.
const { fromMock, invokeMock, toastMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  invokeMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: fromMock,
    functions: { invoke: invokeMock },
    storage: {
      from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: '' } }), remove: vi.fn() }),
    },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: toastMock }));

import { AIAutoTagsConfig } from '../AIAutoTagsConfig';

// --- fixtures --------------------------------------------------------------
// Resposta de SUCESSO da edge `ai-auto-tag` (supabase/functions/ai-auto-tag/index.ts:296-305):
// HTTP 200 com o envelope de execucao `status: 'ok'`.
const OK = {
  data: { capability: 'ai-auto-tag', status: 'ok', tags: [{ name: 'vendas', confidence: 0.9 }] },
  error: null,
};

// Resposta de ERRO: a funcao devolve 502 com envelope `status: 'error'` e o
// supabase-js converte o HTTP nao-ok em `{ data: null, error }` — NAO lanca.
const ERRO = { data: null, error: new Error('Edge Function returned a non-2xx status code') };

const CONTATOS = [{ id: 'c1' }, { id: 'c2' }];
const CONTACT_ROW = {
  id: 'contato-popup-1',
  name: 'Maria Silva',
  phone: '+5511****9999',
  avatar_url: null,
  email: null,
  tags: [],
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-09-01T10:00:00Z',
  ai_priority: null,
  status: 'open',
  last_message: 'oi',
  unread_count: 0,
  assigned_to: null,
};

function montarSupabase(respostasPorContato: Record<string, typeof OK | typeof ERRO>) {
  fromMock.mockImplementation((tabela: string) => {
    if (tabela === 'ai_conversation_tags') {
      return { select: () => Promise.resolve({ data: [], error: null }) };
    }
    if (tabela === 'contacts') {
      return {
        select: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: CONTATOS, error: null }) }),
          eq: () => ({ single: async () => ({ data: CONTACT_ROW, error: null }) }),
        }),
      };
    }
    return {
      select: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        eq: () => ({ single: async () => ({ data: null, error: null }) }),
      }),
    };
  });

  invokeMock.mockImplementation((_fn: string, opts: { body: { contactId: string } }) =>
    Promise.resolve(respostasPorContato[opts.body.contactId]),
  );
}

function renderizar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<AIAutoTagsConfig />, { wrapper: Wrapper });
}

// Descricao do ultimo toast disparado pelo botao "Classificar Recentes".
async function descricaoDoToast() {
  await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(CONTATOS.length), { timeout: 10000 });
  await waitFor(() => expect(toastMock).toHaveBeenCalled(), { timeout: 10000 });
  const ultimo = toastMock.mock.calls[toastMock.mock.calls.length - 1][0] as { description?: string };
  return ultimo.description ?? '';
}

describe('AIAutoTagsConfig — Classificar Recentes nao conta resposta de erro como classificada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('conta so a conversa classificada e reporta a que falhou', async () => {
    montarSupabase({ c1: OK, c2: ERRO });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: /Classificar Recentes/i }));

    const descricao = await descricaoDoToast();
    expect(descricao).toContain('1 conversas classificadas por IA');
    expect(descricao).not.toContain('2 conversas');
    expect(descricao).toContain('1 falha');
  });

  it('quando todas as respostas sao erro, nao anuncia conversas classificadas', async () => {
    montarSupabase({ c1: ERRO, c2: ERRO });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: /Classificar Recentes/i }));

    const descricao = await descricaoDoToast();
    expect(descricao).toContain('2 respostas de erro');
    expect(descricao).not.toContain('classificadas por IA');
  });

  it('mantem a contagem cheia quando todas as respostas sao sucesso', async () => {
    montarSupabase({ c1: OK, c2: OK });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: /Classificar Recentes/i }));

    const descricao = await descricaoDoToast();
    expect(descricao).toBe('2 conversas classificadas por IA.');
  });
});
