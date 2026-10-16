import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Achado OTH-003 (item 52 do BACKLOG_VERIFICADO) — "Sincronização Gmail parcial
// gera toast de sucesso".
//
// O backend `gmail-sync` preserva a falha parcial e responde HTTP 207 com
// `{ success: false, synced, failed }` (supabase/functions/gmail-sync/index.ts:81-88).
// O FunctionsClient oficial trata 2xx (inclusive 207) como sucesso: devolve
// `error: null` e o payload do domínio. Por isso o defeito vive na interpretação
// do payload no hook, não no transporte.
//
// Este teste integra as duas camadas: mocka o `supabase.functions.invoke` (a
// semântica do SDK para 207 = `{ data: <payload>, error: null }`) e passa pelo
// `callGmailFunction` real para checar o que o operador vê.

const { invokeMock, getSessionMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getSessionMock: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: getSessionMock },
    functions: { invoke: invokeMock },
    rpc: vi.fn(),
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/gmailOAuth', () => ({
  createGmailOAuthState: vi.fn(() => 'state-abc'),
  storeGmailOAuthReturnContext: vi.fn(),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  RESERVED_HASHES: new Set(['main-content', 'main-navigation']),
}));

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useGmail } from '../useGmail';

const MOCK_ACCOUNT = {
  id: 'acc1',
  email_address: 'user@example.com',
  is_active: true,
  sync_status: 'synced' as const,
  last_sync_at: null,
  last_error: null,
  created_at: '2024-01-01T00:00:00Z',
};

function makeFromChain(data: unknown[] = [], error: null | object = null) {
  const end = vi.fn().mockResolvedValue({ data, error });
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(),
    limit: end,
    range: end,
    in: vi.fn().mockResolvedValue({ data, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: data[0] ?? null, error }),
  };
  chain.order.mockReturnValue(chain);
  return chain;
}

function makeHarness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

// Um único mock para o invoke: list-accounts devolve a conta; qualquer ação do
// `gmail-sync` devolve o payload passado (o formato exato do domínio).
// O corpo real chega em `opts.body` (o invoke recebe `{ body, headers }`).
function actionOf(opts: unknown): string | undefined {
  return (opts as { body?: { action?: string } } | undefined)?.body?.action;
}

function respondWithSyncPayload(payload: Record<string, unknown>) {
  invokeMock.mockImplementation(async (fn: string, opts: unknown) => {
    if (fn === 'gmail-oauth' && actionOf(opts) === 'list-accounts') {
      return { data: { accounts: [MOCK_ACCOUNT] }, error: null };
    }
    if (fn === 'gmail-sync') return { data: payload, error: null };
    return { data: {}, error: null };
  });
}

describe('useGmail — sincronização parcial (OTH-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() } as any);
  });

  it('HTTP 207 (4 sincronizados, 1 falha) mostra aviso parcial e nunca toast de sucesso integral', async () => {
    respondWithSyncPayload({ success: false, synced: 4, failed: 1 });
    const { qc, wrapper } = makeHarness();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => { await result.current.syncInbox.mutateAsync({}); });

    // Defeito: antes, o callback mostrava `${data.synced} emails sincronizados` mesmo com 1 falha.
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(toast.warning).mock.calls[0];
    expect(String(title)).toMatch(/parcial/i);
    const description = String((options as { description?: string } | undefined)?.description ?? '');
    expect(description).toContain('1');
    expect(description).toContain('4');
    // A conta (sync_status=error + last_error, salvos pelo backend) precisa sair do cache.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gmail-accounts'] });
    // Threads e contagens também são reconciliados.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gmail-threads'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gmail-thread-counts'] });
  });

  it('HTTP 207 sem nada sincronizado aparece como falha, não como parcial', async () => {
    respondWithSyncPayload({ success: false, synced: 0, failed: 2 });
    const { wrapper } = makeHarness();

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => { await result.current.syncInbox.mutateAsync({}); });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    const [, options] = vi.mocked(toast.error).mock.calls[0];
    const description = String((options as { description?: string } | undefined)?.description ?? '');
    expect(description).toContain('2');
  });

  it('sincronização completa mantém o toast de sucesso com a contagem', async () => {
    respondWithSyncPayload({ success: true, synced: 5, failed: 0 });
    const { wrapper } = makeHarness();

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => { await result.current.syncInbox.mutateAsync({}); });

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('5'));
  });

  it('não dispara retry automático em 207 (a recuperação é explícita, sem re-sincronizar sozinho)', async () => {
    respondWithSyncPayload({ success: false, synced: 4, failed: 1 });
    const { wrapper } = makeHarness();

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => { await result.current.syncInbox.mutateAsync({}); });

    const syncCalls = invokeMock.mock.calls.filter(([, opts]) => actionOf(opts) === 'sync-inbox');
    expect(syncCalls).toHaveLength(1);
  });

  it('a recuperação é explícita: a ação do aviso refaz a sincronização pendente', async () => {
    respondWithSyncPayload({ success: false, synced: 4, failed: 1 });
    const { wrapper } = makeHarness();

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => { await result.current.syncInbox.mutateAsync({}); });

    const [, options] = vi.mocked(toast.warning).mock.calls[0];
    const action = (options as { action?: { label: string; onClick: () => void } } | undefined)?.action;
    expect(action?.label).toBe('Tentar de novo');

    await act(async () => { action?.onClick(); });
    await waitFor(() => {
      const syncCalls = invokeMock.mock.calls.filter(([, opts]) => actionOf(opts) === 'sync-inbox');
      expect(syncCalls).toHaveLength(2);
    });
  });
});
