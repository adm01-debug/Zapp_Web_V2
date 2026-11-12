import { renderHook, waitFor, act } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Console de produção (12/11): `functions/v1/gmail-sync` → 409 DUAS vezes.
//
// O `gmail-sync` responde 409 "Gmail sync already in progress" quando outra
// sincronização da conta já segurou a trava (claimGmailAccountSync). A mutação
// `syncInbox` tinha `retry: 1`: repetia ~1 s depois, a trava ainda estava com a
// outra execução, e o operador via dois 409 e um toast de ERRO para um estado
// esperado. Aqui o `invoke` real do SDK é imitado: erro HTTP chega como
// `{ data: null, error: FunctionsHttpError }` com `context` = Response (status).

const { invokeMock, getSessionMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getSessionMock: vi.fn(async () => ({ data: { session: { access_token: 'tok' } } })),
}));


// Y29 — o useGmail lê `profiles.can_download` (useDownloadPermission); aqui a
// permissão é concedida para o teste observar o caminho de sempre.
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/gmailOAuth', () => ({
  createGmailOAuthState: vi.fn(() => 'state-abc'),
  storeGmailOAuthReturnContext: vi.fn(),
}));
vi.mock('@/hooks/system/useNavigationHistory', () => ({
  RESERVED_HASHES: new Set(['main-content', 'main-navigation']),
}));

import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useGmail, shouldRetryGmailSync, isGmailSyncAlreadyRunning, isGmailReauthRequired } from '../useGmail';
import { GmailFunctionError } from '../../gmail/gmailApi';

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

function httpError(status: number, message: string) {
  return { name: 'FunctionsHttpError', message, context: { status } };
}

// Como o SDK real: `context` é a Response, com o corpo JSON da função.
function httpErrorWithBody(status: number, body: unknown) {
  return {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  };
}

function respondSyncWithStatus(status: number, body?: unknown) {
  invokeMock.mockImplementation(async (fn: string, opts: unknown) => {
    if (fn === 'gmail-oauth' && actionOf(opts) === 'list-accounts') {
      return { data: { accounts: [MOCK_ACCOUNT] }, error: null };
    }
    if (fn === 'gmail-sync') {
      return { data: null, error: body === undefined ? httpError(status, `Edge Function returned a non-2xx status code`) : httpErrorWithBody(status, body) };
    }
    return { data: {}, error: null };
  });
}

const syncCalls = () => invokeMock.mock.calls.filter(([fn]) => fn === 'gmail-sync').length;

describe('useGmail — 409 do gmail-sync (sincronização já em andamento)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.from).mockImplementation(() => makeFromChain() as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() } as any);
  });

  it('409 não repete a chamada e mostra aviso informativo, não erro', async () => {
    respondSyncWithStatus(409);
    const { qc, wrapper } = makeHarness();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => {
      await result.current.syncInbox.mutateAsync({}).catch(() => undefined);
    });

    // Defeito: antes, `retry: 1` disparava o segundo 409.
    expect(syncCalls()).toBe(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(toast.info).mock.calls[0][0])).toMatch(/em andamento/i);
    // O estado salvo da conta (sync_status) volta a ser lido.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gmail-accounts'] });
  });

  it('409 com corpo "já em andamento" (Response real) segue como aviso informativo', async () => {
    respondSyncWithStatus(409, { error: 'Gmail sync already in progress' });
    const { wrapper } = makeHarness();
    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => {
      await result.current.syncInbox.mutateAsync({}).catch(() => undefined);
    });

    expect(syncCalls()).toBe(1);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('409 reauth_required NÃO vira "em andamento": pede reconexão e recarrega a conta', async () => {
    respondSyncWithStatus(409, { code: 'reauth_required', error: 'Sessão do Gmail expirada — reconecte a conta' });
    const { qc, wrapper } = makeHarness();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => {
      await result.current.syncInbox.mutateAsync({}).catch(() => undefined);
    });

    expect(syncCalls()).toBe(1);
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toMatch(/expirada/i);
    expect(JSON.stringify(vi.mocked(toast.error).mock.calls[0][1])).toMatch(/reconecte/i);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['gmail-accounts'] });
  });

  it('falha de servidor (500) ainda ganha UMA nova tentativa e toast de erro', async () => {
    respondSyncWithStatus(500);
    const { wrapper } = makeHarness();

    const { result } = renderHook(() => useGmail(), { wrapper });
    await waitFor(() => expect(result.current.activeAccount).toBeDefined());

    await act(async () => {
      await result.current.syncInbox.mutateAsync({}).catch(() => undefined);
    });

    expect(syncCalls()).toBe(2);
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  }, 10_000);
});

describe('shouldRetryGmailSync / isGmailSyncAlreadyRunning', () => {
  const err = (status?: number) => new GmailFunctionError(status === undefined ? new Error('rede') : httpError(status, 'x'));

  it('nunca repete 4xx (exceto 429) e nunca passa de uma tentativa extra', () => {
    for (const status of [400, 401, 403, 409]) expect(shouldRetryGmailSync(0, err(status))).toBe(false);
    expect(shouldRetryGmailSync(0, err(429))).toBe(true);
    expect(shouldRetryGmailSync(0, err(500))).toBe(true);
    expect(shouldRetryGmailSync(0, err())).toBe(true);
    expect(shouldRetryGmailSync(1, err(500))).toBe(false);
  });

  it('reconhece o 409 só no erro do gmailApi', () => {
    expect(isGmailSyncAlreadyRunning(err(409))).toBe(true);
    expect(isGmailSyncAlreadyRunning(err(500))).toBe(false);
    expect(isGmailSyncAlreadyRunning(new Error('409'))).toBe(false);
  });

  it('409 com code reauth_required é reconexão, não "já em andamento"', () => {
    const reauth = new GmailFunctionError(httpError(409, 'x'), 'reauth_required');
    expect(isGmailSyncAlreadyRunning(reauth)).toBe(false);
    expect(isGmailReauthRequired(reauth)).toBe(true);
    expect(isGmailReauthRequired(err(409))).toBe(false);
    expect(shouldRetryGmailSync(0, reauth)).toBe(false);
  });
});
