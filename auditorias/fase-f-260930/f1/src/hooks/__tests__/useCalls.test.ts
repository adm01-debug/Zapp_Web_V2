import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => {
  const mockFrom = vi.fn().mockImplementation(() => ({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'call-1' }, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'p1' }, error: null }),
      }),
    }),
  }));
  return {
    supabase: {
      from: mockFrom,
      auth: { getUser: vi.fn() },
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useCalls } from '../communication/useCalls';

describe('useCalls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should initialize with null currentCallId', () => {
    const { result } = renderHook(() => useCalls());
    expect(result.current.currentCallId).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('should start a call and return call ID', async () => {
    const { result } = renderHook(() => useCalls());
    let callId: string | null = null;
    await act(async () => {
      callId = await result.current.startCall({
        contactPhone: '5511999',
        contactName: 'Test',
        direction: 'outbound',
      });
    });
    expect(callId).toBe('call-1');
  });

  it('should answer a call', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.answerCall('call-1');
    });
    expect(success).toBe(true);
  });

  it('should end a call', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.endCall('call-1', 120);
    });
    expect(success).toBe(true);
  });

  it('should mark call as missed', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.missCall('call-1');
    });
    expect(success).toBe(true);
  });

  it('should add notes to a call', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.addCallNotes('call-1', 'Test note');
    });
    expect(success).toBe(true);
  });

  it('should get contact calls', async () => {
    const { result } = renderHook(() => useCalls());
    let calls: any[] = [];
    await act(async () => {
      calls = await result.current.getContactCalls('contact-1');
    });
    expect(Array.isArray(calls)).toBe(true);
  });

  // === EDGE CASES ===

  it('should handle startCall with empty contactId', async () => {
    const { result } = renderHook(() => useCalls());
    await act(async () => {
      await result.current.startCall({
        contactPhone: '123',
        contactName: 'Test',
        direction: 'inbound',
      });
    });
    // Should not crash
  });

  it('should handle endCall with zero duration', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.endCall('call-1', 0);
    });
    expect(success).toBe(true);
  });

  it('should handle addCallNotes with empty notes', async () => {
    const { result } = renderHook(() => useCalls());
    let success = false;
    await act(async () => {
      success = await result.current.addCallNotes('call-1', '');
    });
    expect(success).toBe(true);
  });
});
