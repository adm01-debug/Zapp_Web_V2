import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Invitation } from 'sip.js';

// A classe mockada de Invitation (abaixo) não tem a mesma assinatura de
// construtor da real (que exige UserAgent + IncomingInviteRequest) — o cast
// é só para satisfazer o typecheck contra os tipos reais do sip.js.
async function createMockInvitation(): Promise<Invitation> {
  const mod = await import('sip.js');
  return new (mod.Invitation as unknown as new () => Invitation)();
}

// Mock sip.js
const mockBye = vi.fn();
const mockCancel = vi.fn();
const mockInviterReject = vi.fn().mockResolvedValue(undefined);
const mockInvite = vi.fn().mockResolvedValue(undefined);
type StateListener = (state: string) => void;
const mockStateChangeListeners: StateListener[] = [];
const mockRegisterStateListeners: StateListener[] = [];
let lastOnInvite: ((invitation: unknown) => void) | undefined;

const mockSessionDescriptionHandler = {
  peerConnection: {
    getReceivers: vi.fn().mockReturnValue([]),
    getSenders: vi.fn().mockReturnValue([]),
  },
};

vi.mock('sip.js', () => {
  const SessionState = {
    Establishing: 'Establishing',
    Established: 'Established',
    Terminated: 'Terminated',
  };

  return {
    SessionState,
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
        lastOnInvite = options.delegate?.onInvite;
      }
    },
    Registerer: class {
      stateChange = {
        addListener: (fn: StateListener) => { mockRegisterStateListeners.push(fn); },
      };
      register = vi.fn().mockResolvedValue(undefined);
      unregister = vi.fn().mockResolvedValue(undefined);
    },
    Inviter: class MockInviter {
      state = 'Initial';
      sessionDescriptionHandler = mockSessionDescriptionHandler;
      stateChange = {
        addListener: (fn: (state: string) => void) => {
          mockStateChangeListeners.push((state: string) => { this.state = state; fn(state); });
        },
      };
      invite = mockInvite;
      bye = mockBye;
      cancel = mockCancel;
    },
    Invitation: class MockInvitation {
      state = 'Initial';
      sessionDescriptionHandler = mockSessionDescriptionHandler;
      stateChange = {
        addListener: (fn: (state: string) => void) => {
          mockStateChangeListeners.push((state: string) => { this.state = state; fn(state); });
        },
      };
      remoteIdentity = { uri: { user: '5511988887777' }, displayName: '' };
      accept = vi.fn().mockResolvedValue(undefined);
      reject = mockInviterReject;
    },
    Web: {
      SessionDescriptionHandler: class {},
    },
  };
});

const mockStartCall = vi.fn().mockResolvedValue('call-1');
const mockAnswerCall = vi.fn().mockResolvedValue(true);
const mockEndCall = vi.fn().mockResolvedValue(true);
const mockMissCall = vi.fn().mockResolvedValue(true);

vi.mock('../communication/useCalls', () => ({
  useCalls: () => ({
    startCall: mockStartCall,
    answerCall: mockAnswerCall,
    endCall: mockEndCall,
    missCall: mockMissCall,
    currentCallId: null,
    isLoading: false,
    addCallNotes: vi.fn(),
    getContactCalls: vi.fn(),
  }),
}));

function makeQueryBuilder(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    or: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

const { mockFunctionsInvoke } = vi.hoisted(() => ({
  mockFunctionsInvoke: vi.fn().mockResolvedValue({ data: { password: 'test-pass' }, error: null }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => makeQueryBuilder()),
    functions: { invoke: mockFunctionsInvoke },
  },
}));

// Polyfill MediaStream for jsdom
globalThis.MediaStream = class MediaStream {
  addTrack() {}
  getTracks() { return []; }
} as unknown as typeof globalThis.MediaStream;

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useSipClient } from '../communication/useSipClient';
import { toast } from 'sonner';

describe('useSipClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStateChangeListeners.length = 0;
    mockRegisterStateListeners.length = 0;
    mockStartCall.mockResolvedValue('call-1');
    mockFunctionsInvoke.mockResolvedValue({ data: { password: 'test-pass' }, error: null });
    lastOnInvite = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // === CONNECTION TESTS ===

  it('should start with disconnected status', () => {
    const { result } = renderHook(() => useSipClient());
    expect(result.current.sipStatus).toBe('disconnected');
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.isMuted).toBe(false);
    expect(result.current.callDuration).toBe(0);
    expect(result.current.currentNumber).toBe('');
  });

  it('should set connecting status when connect is called', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(result.current.sipStatus).toBe('connecting');
  });

  it('should become registered when registerer fires Registered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    expect(result.current.sipStatus).toBe('registered');
    expect(toast.success).toHaveBeenCalledWith('VoIP conectado!');
  });

  it('should set disconnected when registerer fires Unregistered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Unregistered'));
    });
    expect(result.current.sipStatus).toBe('disconnected');
  });

  it('should disconnect properly', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });
    expect(result.current.sipStatus).toBe('registered');

    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.sipStatus).toBe('disconnected');
  });

  // === CREDENTIAL FETCH (connectWithStoredCredentials) ===

  it('happy path: fetches the SIP password and connects when invoke succeeds', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({ data: { password: 'secret123' }, error: null });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(result.current.sipStatus).toBe('connecting');
  });

  it('shows SIP_PASSWORD config toast when invoke returns 503', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 503, code: 'SIP_NOT_CONFIGURED' } },
    });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('SIP_PASSWORD'));
    expect(result.current.sipStatus).toBe('disconnected');
  });

  it('shows a generic session toast for non-config invoke errors (401)', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: null,
      error: { context: { status: 401, code: 'UNAUTHORIZED' } },
    });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('sessão'));
    expect(result.current.sipStatus).toBe('disconnected');
  });

  it('shows SIP_PASSWORD config toast when invoke returns no error but no password', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({ data: null, error: null });
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connectWithStoredCredentials();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('SIP_PASSWORD'));
    expect(result.current.sipStatus).toBe('disconnected');
  });

  // === OUTBOUND CALL TESTS ===

  it('should reject call when not registered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.makeCall('123');
    });
    expect(toast.error).toHaveBeenCalledWith('VoIP não conectado.');
    expect(result.current.callStatus).toBe('idle');
  });

  it('should set calling status and register the call before the invite resolves', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('5511999999999');
    });
    expect(result.current.callStatus).toBe('calling');
    expect(result.current.callDirection).toBe('outbound');
    expect(result.current.currentNumber).toBe('5511999999999');
    expect(mockStartCall).toHaveBeenCalledWith(expect.objectContaining({ direction: 'outbound', contactPhone: '5511999999999' }));
  });

  it('should transition to ringing on Establishing', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('123');
    });

    act(() => {
      mockStateChangeListeners.forEach(fn => fn('Establishing'));
    });
    expect(result.current.callStatus).toBe('ringing');
  });

  it('should transition to active on Established, start timer and mark the call answered', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('123');
    });

    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
      await Promise.resolve();
    });
    expect(result.current.callStatus).toBe('active');
    expect(mockAnswerCall).toHaveBeenCalledWith('call-1');

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.callDuration).toBe(3);

    vi.useRealTimers();
  });

  it('records the call as missed when terminated before being answered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('123');
    });

    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await Promise.resolve();
    });

    expect(mockMissCall).toHaveBeenCalledWith('call-1');
    expect(mockEndCall).not.toHaveBeenCalled();
  });

  it('records the call as ended (not missed) when terminated after being answered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('123');
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
      await Promise.resolve();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await Promise.resolve();
    });

    expect(mockEndCall).toHaveBeenCalledWith('call-1', expect.any(Number));
    expect(mockMissCall).not.toHaveBeenCalled();
  });

  it('should cancel a pending invite on hangUp without waiting for the invite promise', async () => {
    // O invite() nunca resolve neste teste — hangUp() precisa achar a sessão
    // mesmo assim, porque ela é atribuída antes do await (corrige a corrida
    // em que um cancelamento rápido não encontrava sessão nenhuma).
    mockInvite.mockReturnValueOnce(new Promise(() => {}));
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    act(() => { result.current.makeCall('123'); });
    await act(async () => { await Promise.resolve(); });

    act(() => { result.current.hangUp(); });
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should not force idle immediately on hangUp of an active call — waits for Terminated', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));
    await act(async () => { await result.current.makeCall('123'); });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
      await Promise.resolve();
    });

    act(() => { result.current.hangUp(); });
    expect(mockBye).toHaveBeenCalled();
    // bye() foi pedido, mas o estado só reflete o fim quando Terminated chegar.
    expect(result.current.callStatus).toBe('active');

    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await Promise.resolve();
    });
    expect(result.current.callStatus).toBe('ended');
  });

  it('should handle hangUp gracefully with no active session', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => { result.current.hangUp(); });
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.isMuted).toBe(false);
  });

  // === MUTE / DTMF ===

  it('should start unmuted', () => {
    const { result } = renderHook(() => useSipClient());
    expect(result.current.isMuted).toBe(false);
  });

  it('should not crash toggleMute without active session', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => { result.current.toggleMute(); });
    expect(result.current.isMuted).toBe(false);
  });

  it('should not crash sendDTMF without active session', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => { result.current.sendDTMF('1'); });
  });

  it('should reject a second makeCall while one is already in progress', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => { await result.current.makeCall('111'); });
    await act(async () => { await result.current.makeCall('222'); });

    expect(toast.error).toHaveBeenCalledWith('Já existe uma chamada em andamento.');
    expect(result.current.currentNumber).toBe('111');
  });

  it('should clean up the interval timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSipClient());
    unmount();
    vi.useRealTimers();
  });

  // === INBOUND CALL TESTS ===

  it('surfaces an incoming SIP invitation as a ringing inbound call', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    expect(lastOnInvite).toBeInstanceOf(Function);

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await Promise.resolve();
    });

    expect(result.current.callStatus).toBe('ringing');
    expect(result.current.callDirection).toBe('inbound');
    expect(result.current.currentNumber).toBe('5511988887777');
    expect(mockStartCall).toHaveBeenCalledWith(expect.objectContaining({ direction: 'inbound', contactPhone: '5511988887777' }));
  });

  it('rejects a second incoming invitation as busy while a call is active', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await Promise.resolve();
    });

    const secondInvitation = await createMockInvitation();
    await act(async () => {
      lastOnInvite?.(secondInvitation);
      await Promise.resolve();
    });

    expect((secondInvitation as unknown as { reject: ReturnType<typeof vi.fn> }).reject).toHaveBeenCalledWith({ statusCode: 486 });
  });

  it('answers the call once acceptIncomingCall is invoked', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    let invitation!: Invitation;

    await act(async () => {
      invitation = await createMockInvitation();
      lastOnInvite?.(invitation);
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.acceptIncomingCall();
    });
    expect((invitation as unknown as { accept: ReturnType<typeof vi.fn> }).accept).toHaveBeenCalled();
  });

  it('marks the call missed when rejectIncomingCall is invoked', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });

    await act(async () => {
      lastOnInvite?.(await createMockInvitation());
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.rejectIncomingCall();
    });
    await act(async () => {
      mockStateChangeListeners.forEach(fn => fn('Terminated'));
      await Promise.resolve();
    });

    expect(mockMissCall).toHaveBeenCalledWith('call-1');
  });
});
