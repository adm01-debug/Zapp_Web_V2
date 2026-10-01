import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';

type StateListener = (state: string) => void;
const mockRegisterStateListeners: StateListener[] = [];
// T15: as opções passadas ao `register` (para exercitar o `onReject` do 403).
type RegisterOptions = { requestDelegate?: { onReject?: (response: { message: { statusCode: number } }) => void } };
const mockRegisterCalls: Array<RegisterOptions | undefined> = [];
const mockUaInstances: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; transport: { onDisconnect: (() => void) | null } }> = [];
let lastDelegate: { onInvite?: (invitation: unknown) => void } | undefined;

vi.mock('sip.js', () => {
  return {
    UserAgent: class {
      static makeURI(uri: string) {
        if (uri.includes('invalid')) return null;
        return { host: 'test.server.com' };
      }
      configuration = { uri: { host: 'test.server.com' } };
      transport: { onDisconnect: (() => void) | null } = { onDisconnect: null };
      start = vi.fn().mockResolvedValue(undefined);
      stop = vi.fn().mockResolvedValue(undefined);
      constructor(options: { delegate?: { onInvite?: (invitation: unknown) => void } }) {
        lastDelegate = options.delegate;
        mockUaInstances.push(this);
      }
    },
    Registerer: class {
      stateChange = {
        addListener: (fn: StateListener) => { mockRegisterStateListeners.push(fn); },
      };
      register = vi.fn((options?: RegisterOptions) => { mockRegisterCalls.push(options); return Promise.resolve(undefined); });
      unregister = vi.fn().mockResolvedValue(undefined);
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useSipConnection } from '../useSipConnection';

describe('useSipConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegisterStateListeners.length = 0;
    mockRegisterCalls.length = 0;
    mockUaInstances.length = 0;
    lastDelegate = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the incoming-invitation delegate on connect', async () => {
    const onIncomingInvitation = vi.fn();
    const { result } = renderHook(() => useSipConnection(onIncomingInvitation));
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(lastDelegate?.onInvite).toBeInstanceOf(Function);
    lastDelegate?.onInvite?.({ fake: 'invitation' });
    expect(onIncomingInvitation).toHaveBeenCalledWith({ fake: 'invitation' });
  });

  it('T15: 403 no REGISTER vira "linha em uso por outro usuário" (não erro genérico)', async () => {
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    const onReject = mockRegisterCalls[0]?.requestDelegate?.onReject;
    expect(onReject).toBeInstanceOf(Function);
    await act(async () => { onReject?.({ message: { statusCode: 403 } }); });
    expect(result.current.sipStatus).toBe('error');
    expect(result.current.sipReason).toBe('line_in_use_other_user');
    expect(toast.error).toHaveBeenCalledWith('Linha em uso por outro usuário');
  });

  it('T15: resposta que não é 403 não vira "linha em uso"', async () => {
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    await act(async () => {
      mockRegisterCalls[0]?.requestDelegate?.onReject?.({ message: { statusCode: 500 } });
    });
    expect(result.current.sipReason).toBeNull();
    expect(toast.error).not.toHaveBeenCalledWith('Linha em uso por outro usuário');
  });

  it('does not attempt to reconnect after an intentional disconnect', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    await act(async () => {
      await result.current.disconnect();
    });

    const ua = mockUaInstances[0];
    // Um disconnect posterior do transporte (ex.: rede caiu após o stop já
    // ter sido chamado) não deve reagendar reconexão nem redisparar connect().
    act(() => { ua.transport.onDisconnect?.(); });
    const startCallsBefore = mockUaInstances.length;

    act(() => { vi.advanceTimersByTime(60000); });

    expect(mockUaInstances.length).toBe(startCallsBefore);
    vi.useRealTimers();
  });

  it('clears a pending reconnect timer when disconnect is called mid-backoff', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSipConnection());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    const ua = mockUaInstances[0];
    act(() => { ua.transport.onDisconnect?.(); }); // agenda uma tentativa de reconexão
    expect(result.current.sipStatus).toBe('disconnected');

    await act(async () => { await result.current.disconnect(); });
    const uaCountAfterDisconnect = mockUaInstances.length;

    // Se o timer de reconexão não tivesse sido limpo, isto criaria um novo UserAgent.
    act(() => { vi.advanceTimersByTime(60000); });
    expect(mockUaInstances.length).toBe(uaCountAfterDisconnect);

    vi.useRealTimers();
  });
});
