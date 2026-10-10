import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';

const mockFrom = vi.fn();
const mockFunctionsInvoke = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useDeviceDetection } from '@/hooks/ui/useDeviceDetection';

// Sequência observável de efeitos (revogações e delete do dispositivo). Serve
// para provar ORDEM (delete só depois de todas as revogações) e AUSÊNCIA
// (fail-closed: nenhum delete quando uma revogação falha).
let events: string[] = [];

// Builder thenable que emula a cadeia do supabase-js. `thenResult` resolve o
// `await builder` (select/eq/order encadeados), `maybeSingleResult` resolve o
// `.maybeSingle()` e `onDelete` é disparado quando `.delete()` é chamado.
function makeBuilder(opts: {
  thenResult?: () => Promise<unknown>;
  maybeSingleResult?: () => Promise<unknown>;
  onDelete?: () => void;
} = {}) {
  const thenResult = opts.thenResult ?? (() => Promise.resolve({ data: [], error: null }));
  const maybeSingleResult = opts.maybeSingleResult ?? (() => Promise.resolve({ data: null, error: null }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  b.select = vi.fn(() => b);
  b.eq = vi.fn(() => b);
  b.order = vi.fn(() => b);
  b.neq = vi.fn(() => b);
  b.update = vi.fn(() => b);
  b.delete = vi.fn(() => {
    opts.onDelete?.();
    return b;
  });
  b.maybeSingle = vi.fn(() => maybeSingleResult());
  b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => thenResult().then(res, rej);
  return b;
}

// Grava no log de eventos cada revogação de sessão Auth disparada pelo hook
// (resolvendo com sucesso).
function mockInvokeRevokeSuccess() {
  mockFunctionsInvoke.mockImplementation((_fn: string, opts?: { body?: Record<string, unknown> }) => {
    const scope = opts?.body?.scope;
    const target = opts?.body?.target_session_id;
    events.push(scope === 'others' ? 'revoke:others' : `revoke:local:${target ?? ''}`);
    return Promise.resolve({ data: { revoked: 1 }, error: null });
  });
}

// Igual ao sucesso, mas a revogação FALHA (registra a tentativa e rejeita).
function mockInvokeRevokeReject() {
  mockFunctionsInvoke.mockImplementation((_fn: string, opts?: { body?: Record<string, unknown> }) => {
    const target = opts?.body?.target_session_id;
    events.push(`revoke:local:${target ?? ''}`);
    return Promise.reject(new Error('revogação falhou'));
  });
}

function setupDefaultMocks() {
  mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
  mockFunctionsInvoke.mockResolvedValue({ data: { revoked: 1 }, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_sessions') {
      return makeBuilder({
        maybeSingleResult: () => Promise.resolve({ data: { auth_session_id: 'auth-s1' }, error: null }),
      });
    }
    return makeBuilder();
  });
}

// Renderiza o hook, aguarda a carga inicial (que dispara checkDevice) e reseta o
// mock de invoke e o log de eventos para isolar as chamadas de revogação da
// mutação sob teste.
async function renderLoaded() {
  const rendered = renderHook(() => useDeviceDetection());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  mockFunctionsInvoke.mockReset();
  events = [];
  mockInvokeRevokeSuccess();
  return rendered;
}

describe('useDeviceDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    events = [];
    setupDefaultMocks();
  });

  it('initializes with loading=true', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.loading).toBe(true);
  });

  it('returns empty devices initially', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.devices).toEqual([]);
  });

  it('returns empty sessions initially', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.sessions).toEqual([]);
  });

  it('currentDeviceId starts as null', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.currentDeviceId).toBeNull();
  });

  it('exposes the mutation/read functions', () => {
    const { result } = renderHook(() => useDeviceDetection());
    expect(typeof result.current.trustDevice).toBe('function');
    expect(typeof result.current.removeDevice).toBe('function');
    expect(typeof result.current.endSession).toBe('function');
    expect(typeof result.current.endAllOtherSessions).toBe('function');
    expect(typeof result.current.refetch).toBe('function');
  });

  it('does not fetch when no user', () => {
    mockUseAuth.mockReturnValue({ user: null });
    const { result } = renderHook(() => useDeviceDetection());
    expect(result.current.devices).toEqual([]);
  });

  it('fetches devices and sessions when user present', async () => {
    const { result } = renderHook(() => useDeviceDetection());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFrom).toHaveBeenCalledWith('user_devices');
    expect(mockFrom).toHaveBeenCalledWith('user_sessions');
  });

  // ─── Critério 3: encerrar uma revoga só a alvo (scope local) ───

  it('endSession envia target_session_id Auth com scope local', async () => {
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.endSession('sess-row-1');
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('revoke-auth-sessions', {
      body: { scope: 'local', target_session_id: 'auth-s1' },
    });
  });

  // ─── Critério 3: encerrar outras usa scope others ───

  it('endAllOtherSessions usa scope others (preserva a corrente no servidor)', async () => {
    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.endAllOtherSessions();
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('revoke-auth-sessions', {
      body: { scope: 'others' },
    });
  });

  // ─── Critério 3: remover dispositivo revoga todas as sessões Auth antes de excluir ───

  it('removeDevice revoga cada sessão Auth vinculada e só então exclui (delete por último)', async () => {
    const deviceSessions = [{ auth_session_id: 'auth-s1' }, { auth_session_id: 'auth-s2' }, { auth_session_id: null }];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_sessions') {
        return makeBuilder({ thenResult: () => Promise.resolve({ data: deviceSessions, error: null }) });
      }
      if (table === 'user_devices') {
        return makeBuilder({ onDelete: () => events.push('delete:dev-1') });
      }
      return makeBuilder();
    });

    const { result } = await renderLoaded();

    await act(async () => {
      await result.current.removeDevice('dev-1');
    });

    // Ordem provada pelo log de eventos: só os auth_session_id não nulos são
    // revogados (2, scope local), e o delete do dispositivo só ocorre DEPOIS de
    // todas as revogações — nunca antes, nunca entre elas.
    expect(events).toEqual(['revoke:local:auth-s1', 'revoke:local:auth-s2', 'delete:dev-1']);
  });

  // ─── Critério 5: falha de revogação não remove dispositivo (fail-closed) ───

  it('removeDevice NÃO exclui o dispositivo quando uma revogação falha', async () => {
    const deviceSessions = [{ auth_session_id: 'auth-s1' }, { auth_session_id: 'auth-s2' }];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_sessions') {
        return makeBuilder({ thenResult: () => Promise.resolve({ data: deviceSessions, error: null }) });
      }
      if (table === 'user_devices') {
        return makeBuilder({ onDelete: () => events.push('delete:dev-1') });
      }
      return makeBuilder();
    });

    const { result } = await renderLoaded();
    // A primeira revogação falha; as demais não chegam a acontecer.
    mockInvokeRevokeReject();

    let threw = false;
    await act(async () => {
      try {
        await result.current.removeDevice('dev-1');
      } catch {
        threw = true;
      }
    });

    expect(threw).toBe(true);
    // Apenas a primeira revogação foi tentada (registrada) e o delete do
    // dispositivo NÃO entrou no log — o dispositivo não foi removido.
    expect(events).toEqual(['revoke:local:auth-s1']);
  });

  // ─── Critério 5: falha de revogação não marca sessão encerrada ───

  it('endSession propaga o erro quando a revogação falha (não encerra localmente)', async () => {
    const { result } = await renderLoaded();
    mockFunctionsInvoke.mockRejectedValue(new Error('revogação falhou'));

    let threw = false;
    await act(async () => {
      try {
        await result.current.endSession('sess-row-1');
      } catch {
        threw = true;
      }
    });

    expect(threw).toBe(true);
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('revoke-auth-sessions', {
      body: { scope: 'local', target_session_id: 'auth-s1' },
    });
  });

  // ─── Fail-closed: sessão sem vínculo Auth não pode ser "encerrada" ───

  it('endSession falha fechado quando a sessão não tem auth_session_id', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_sessions') {
        return makeBuilder({
          maybeSingleResult: () => Promise.resolve({ data: { auth_session_id: null }, error: null }),
        });
      }
      return makeBuilder();
    });

    const { result } = await renderLoaded();

    let threw = false;
    await act(async () => {
      try {
        await result.current.endSession('sess-legacy');
      } catch {
        threw = true;
      }
    });

    expect(threw).toBe(true);
    // Sem auth_session_id, a revogação nunca é invocada.
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });
});
