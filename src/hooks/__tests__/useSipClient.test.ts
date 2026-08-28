import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock sip.js
const mockBye = vi.fn();
const mockCancel = vi.fn();
const mockInvite = vi.fn().mockResolvedValue(undefined);
const mockStateChangeListeners: Function[] = [];
const mockRegisterStateListeners: Function[] = [];

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
      transport = { onDisconnect: null as any };
      start = vi.fn().mockResolvedValue(undefined);
      stop = vi.fn().mockResolvedValue(undefined);
    },
    Registerer: class {
      stateChange = {
        addListener: (fn: Function) => { mockRegisterStateListeners.push(fn); },
      };
      register = vi.fn().mockResolvedValue(undefined);
      unregister = vi.fn().mockResolvedValue(undefined);
    },
    Inviter: class {
      state = 'Initial';
      sessionDescriptionHandler = mockSessionDescriptionHandler;
      stateChange = {
        addListener: (fn: Function) => { mockStateChangeListeners.push(fn); },
      };
      invite = mockInvite;
      bye = mockBye;
      cancel = mockCancel;
    },
    Web: {
      SessionDescriptionHandler: class {},
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: {}, error: null }) }) }),
    }),
  },
}));

// Polyfill MediaStream for jsdom
globalThis.MediaStream = class MediaStream {
  addTrack() {}
  getTracks() { return []; }
} as any;

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

  it('should set disconnected when registerer fires Terminated', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Terminated'));
    });
    expect(result.current.sipStatus).toBe('disconnected');
  });

  it('should handle connection error gracefully', async () => {
    const { result } = renderHook(() => useSipClient());
    vi.spyOn(console, 'error').mockImplementation(() => {});
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

  // === CALL TESTS ===

  it('should reject call when not registered', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.makeCall('123');
    });
    expect(toast.error).toHaveBeenCalledWith('VoIP não conectado.');
    expect(result.current.callStatus).toBe('idle');
  });

  it('should set calling status when making a call', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => {
      mockRegisterStateListeners.forEach(fn => fn('Registered'));
    });

    await act(async () => {
      await result.current.makeCall('5511999999999');
    });
    expect(result.current.callStatus).toBe('calling');
    expect(result.current.currentNumber).toBe('5511999999999');
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

  it('should transition to active on Established and start timer', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));

    await act(async () => {
      await result.current.makeCall('123');
    });

    act(() => {
      mockStateChangeListeners.forEach(fn => fn('Established'));
    });
    expect(result.current.callStatus).toBe('active');

    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.callDuration).toBe(3);

    vi.useRealTimers();
  });

  it('should handle hangUp during active call with bye()', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => {
      result.current.hangUp();
    });
    expect(result.current.callStatus).toBe('idle');
    expect(result.current.isMuted).toBe(false);
  });

  it('should reset mute on hangup', async () => {
    const { result } = renderHook(() => useSipClient());
    act(() => {
      result.current.hangUp();
    });
    expect(result.current.isMuted).toBe(false);
  });

  // === MUTE TESTS ===

  it('should start unmuted', () => {
    const { result } = renderHook(() => useSipClient());
    expect(result.current.isMuted).toBe(false);
  });

  it('should not crash toggleMute without active session', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => {
      result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(false);
  });

  // === DTMF TESTS ===

  it('should not crash sendDTMF without active session', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => {
      result.current.sendDTMF('1');
    });
  });

  it('should handle all DTMF digits', () => {
    const { result } = renderHook(() => useSipClient());
    const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#'];
    digits.forEach(d => {
      act(() => { result.current.sendDTMF(d); });
    });
  });

  // === EDGE CASES ===

  it('should handle multiple rapid connect/disconnect cycles', async () => {
    const { result } = renderHook(() => useSipClient());
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
      });
      await act(async () => {
        await result.current.disconnect();
      });
    }
    expect(result.current.sipStatus).toBe('disconnected');
  });

  it('should handle empty phone number', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));
    await act(async () => {
      await result.current.makeCall('');
    });
  });

  it('should handle special characters in phone number', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));
    await act(async () => {
      await result.current.makeCall('+55 (11) 99999-9999');
    });
    expect(result.current.currentNumber).toBe('+55 (11) 99999-9999');
  });

  it('should cleanup timer on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useSipClient());
    unmount();
    vi.useRealTimers();
  });

  it('should handle double hangUp gracefully', () => {
    const { result } = renderHook(() => useSipClient());
    act(() => { result.current.hangUp(); });
    act(() => { result.current.hangUp(); });
    expect(result.current.callStatus).toBe('idle');
  });

  it('should handle makeCall with very long number', async () => {
    const { result } = renderHook(() => useSipClient());
    await act(async () => {
      await result.current.connect({ server: 'test.com', user: 'user1', password: 'pass' });
    });
    act(() => mockRegisterStateListeners.forEach(fn => fn('Registered')));
    const longNumber = '1'.repeat(100);
    await act(async () => {
      await result.current.makeCall(longNumber);
    });
    expect(result.current.currentNumber).toBe(longNumber);
  });
});
