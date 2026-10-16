import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// PE-06 — o módulo de e-mail precisa saber quando a conta exige reconectar.
//
// O backend grava `sync_status='reauth_required'` quando o Google recusa o
// refresh token (supabase/functions/_shared/gmail-helpers.ts). O tipo `GmailAccount`
// não conhecia esse estado e o hook `useGmail` não expunha `sync_status`,
// `last_error` nem `last_sync_at` — a tela não tinha como oferecer "reconectar".
//
// Aqui o hook real é exercitado contra o payload de `gmail-oauth list-accounts`.

const { invokeMock, getSessionMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getSessionMock: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })),
}));

vi.mock('@/hooks/system/useDownloadPermission', () => ({
  useDownloadPermission: () => ({ canDownload: true, isLoading: false }),
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

import { supabase } from '@/integrations/supabase/client';
import { useGmail } from '../useGmail';

type MockAccount = Record<string, unknown>;

const REAUTH_ACCOUNT: MockAccount = {
  id: 'acc1',
  email_address: 'user@example.com',
  is_active: true,
  sync_status: 'reauth_required',
  last_sync_at: '2026-10-12T10:00:00.000Z',
  last_error: 'Refresh token do Google recusado — reconecte a conta',
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

function actionOf(opts: unknown): string | undefined {
  return (opts as { body?: { action?: string } } | undefined)?.body?.action;
}

function respondWithAccount(account: MockAccount) {
  invokeMock.mockImplementation(async (fn: string, opts: unknown) => {
    if (fn === 'gmail-oauth' && actionOf(opts) === 'list-accounts') {
      return { data: { accounts: [account] }, error: null };
    }
    return { data: {}, error: null };
  });
}

describe('useGmail — estado de sincronização da conta (PE-06)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() } as any);
  });

  it('expõe syncStatus, lastError, lastSyncedAt e needsReconnect da conta que exige reconexão', async () => {
    respondWithAccount(REAUTH_ACCOUNT);
    const { wrapper } = makeHarness();

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    expect(result.current.syncStatus).toBe('reauth_required');
    expect(result.current.needsReconnect).toBe(true);
    expect(result.current.lastError).toBe(REAUTH_ACCOUNT.last_error);
    expect(result.current.lastSyncedAt).toBe(REAUTH_ACCOUNT.last_sync_at);
  });

  it('conta saudável não pede reconexão', async () => {
    respondWithAccount({ ...REAUTH_ACCOUNT, sync_status: 'synced', last_error: null });
    const { wrapper } = makeHarness();

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    expect(result.current.syncStatus).toBe('synced');
    expect(result.current.needsReconnect).toBe(false);
    expect(result.current.lastError).toBeNull();
  });

  it('last_error vazio vira null (a tela não mostra texto em branco) e lastSyncedAt acompanha a conta', async () => {
    respondWithAccount({ ...REAUTH_ACCOUNT, sync_status: 'error', last_error: '   ', last_sync_at: null });
    const { wrapper } = makeHarness();

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    expect(result.current.syncStatus).toBe('error');
    expect(result.current.needsReconnect).toBe(false);
    expect(result.current.lastError).toBeNull();
    expect(result.current.lastSyncedAt).toBeNull();
  });

  it('sincronizar atualiza ao vivo: invalida a consulta das contas', async () => {
    respondWithAccount(REAUTH_ACCOUNT);
    const { qc, wrapper } = makeHarness();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => { await result.current.syncInbox.mutateAsync({}); });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gmail-accounts'] });
  });

  it('reconectar atualiza ao vivo: trocar o código do OAuth invalida a consulta das contas', async () => {
    respondWithAccount(REAUTH_ACCOUNT);
    const { qc, wrapper } = makeHarness();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => { await result.current.exchangeCode.mutateAsync({ code: 'c', state: 's' }); });

    const exchangeCalls = invokeMock.mock.calls.filter(([, opts]) => actionOf(opts) === 'exchange-code');
    expect(exchangeCalls).toHaveLength(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gmail-accounts'] });
  });
});
