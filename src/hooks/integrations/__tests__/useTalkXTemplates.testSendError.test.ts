import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * X090 — o recado do TESTE de template, no hook real.
 *
 * O `talkx-send` (`action=test`) responde 403 a quem não é admin/supervisor e
 * 429 quando a pessoa testa demais. Antes, o front mostrava só o texto cru do
 * servidor ("Forbidden", ou "Erro 429"), que não dizia nada a quem estava na
 * tela. Estes casos provam a tradução, no caminho REAL (`useTalkXTemplates`).
 */

/** Builder encadeável mínimo do PostgREST para a consulta da lista. */
function mockQuery(data: unknown) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  ['select', 'eq', 'order', 'limit', 'maybeSingle'].forEach((m) => { builder[m] = vi.fn(self); });
  builder.then = (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data, error: null }).then(onFulfilled);
  return builder;
}

vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: () => mockQuery([]) }));

const getSession = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: () => getSession() }, from: vi.fn() },
}));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useTalkXTemplates } from '../useTalkXTemplates';

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );

const responderCom = (status: number, body: Record<string, unknown>) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
});

describe('X090 — recado do teste de template', () => {
  it('403 → diz que só admin/supervisor pode enviar teste', async () => {
    responderCom(403, { error: 'Forbidden' });
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper });

    await expect(
      result.current.testTemplate({ templateContent: 'oi', phone: '5541999001234' }),
    ).rejects.toThrow('Só admin ou supervisor pode enviar teste.');
  });

  it('429 → diz para aguardar antes de testar de novo', async () => {
    responderCom(429, { error: 'Too Many Requests' });
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper });

    await expect(
      result.current.testTemplate({ templateContent: 'oi', phone: '5541999001234' }),
    ).rejects.toThrow('Muitos testes seguidos. Aguarde alguns instantes e tente de novo.');
  });

  it('400 do servidor (sem conexão ativa) mantém o texto do servidor', async () => {
    responderCom(400, { error: 'Nenhuma conexao WhatsApp ativa' });
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper });

    await expect(
      result.current.testTemplate({ templateContent: 'oi', phone: '5541999001234' }),
    ).rejects.toThrow('Nenhuma conexao WhatsApp ativa');
  });

  it('envio aceito devolve a resposta do servidor', async () => {
    responderCom(200, { success: true, sent: true });
    const { result } = renderHook(() => useTalkXTemplates(), { wrapper });

    await expect(
      result.current.testTemplate({ templateContent: 'oi', phone: '5541999001234' }),
    ).resolves.toMatchObject({ success: true });
  });
});
