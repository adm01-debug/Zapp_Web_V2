import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockChannel = vi.fn();
const mockRemoveChannel = vi.fn();
const mockFrom = vi.fn();
const mockLogInfo = vi.fn();
let realtimeCallback: ((payload: Record<string, unknown>) => void | Promise<void>) | undefined;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mockChannel(...args),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, profile: { id: 'profile-1' } }),
}));

vi.mock('@/lib/logger', () => ({
  log: { info: (...args: unknown[]) => mockLogInfo(...args) },
}));

const { useIncomingCallListener } = await import('@/hooks/communication/useIncomingCallListener');

function incomingNotification(overrides: Record<string, unknown> = {}) {
  return {
    new: {
      id: 'notification-1',
      user_id: 'user-1',
      type: 'incoming_call',
      message: 'Maria está ligando para você',
      created_at: '2026-09-22T19:00:00.000Z',
      metadata: {
        contact_id: 'contact-1',
        contact_name: 'Maria',
        phone: '5511999999999',
        is_video: false,
        call_status: 'ringing',
        whatsapp_connection_id: 'connection-1',
      },
      ...overrides,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

describe('useIncomingCallListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCallback = undefined;
    mockChannel.mockReturnValue({
      on: vi.fn((_event, _config, callback) => {
        realtimeCallback = callback;
        return mockChannel.mock.results[mockChannel.mock.results.length - 1]?.value;
      }),
      subscribe: vi.fn().mockReturnThis(),
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
  });

  it('subscribes to notifications scoped to the authenticated user', () => {
    const on = vi.fn().mockReturnThis();
    mockChannel.mockReturnValue({ on, subscribe: vi.fn().mockReturnThis() });
    renderHook(() => useIncomingCallListener());

    expect(mockChannel).toHaveBeenCalledWith(expect.stringMatching(/^incoming-calls:/));
    expect(on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        table: 'notifications',
        filter: 'user_id=eq.user-1',
      }),
      expect.any(Function),
    );
  });

  it('shows one ringing call from notification metadata and deduplicates replay', async () => {
    const { result } = renderHook(() => useIncomingCallListener());
    const payload = incomingNotification();

    await act(async () => {
      await realtimeCallback?.(payload);
      await realtimeCallback?.(payload);
    });

    expect(result.current.incomingCall).toEqual({
      id: 'notification-1',
      contact_id: 'contact-1',
      contact_name: 'Maria',
      contact_phone: '5511999999999',
      is_video: false,
      whatsapp_connection_id: 'connection-1',
      started_at: '2026-09-22T19:00:00.000Z',
    });
    expect(mockLogInfo).toHaveBeenCalledTimes(1);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not collapse two legitimate calls without a provider event ID', async () => {
    const { result } = renderHook(() => useIncomingCallListener());

    await act(async () => {
      await realtimeCallback?.(incomingNotification({ id: 'notification-first' }));
    });
    act(() => result.current.dismissCall());
    await act(async () => {
      await realtimeCallback?.(incomingNotification({
        id: 'notification-second',
        created_at: '2026-09-22T19:00:10.000Z',
      }));
    });

    expect(result.current.incomingCall?.id).toBe('notification-second');
    expect(mockLogInfo).toHaveBeenCalledTimes(2);
  });

  it('deduplicates different notification rows carrying the same provider event ID', async () => {
    const { result } = renderHook(() => useIncomingCallListener());
    const metadata = {
      contact_id: 'contact-1',
      contact_name: 'Maria',
      phone: '5511999999999',
      call_status: 'ringing',
      event_id: 'provider-event-1',
    };

    await act(async () => {
      await realtimeCallback?.(incomingNotification({ id: 'notification-first', metadata }));
    });
    act(() => result.current.dismissCall());
    await act(async () => {
      await realtimeCallback?.(incomingNotification({ id: 'notification-retry', metadata }));
    });

    expect(result.current.incomingCall).toBeNull();
    expect(mockLogInfo).toHaveBeenCalledTimes(1);
  });

  it.each(['missed', 'busy', 'ended', 'failed'])(
    'ignores non-ringing call status %s',
    async (callStatus) => {
      const { result } = renderHook(() => useIncomingCallListener());
      await act(async () => {
        await realtimeCallback?.(incomingNotification({
          metadata: {
            contact_id: 'contact-1',
            contact_name: 'Maria',
            phone: '5511999999999',
            call_status: callStatus,
          },
        }));
      });
      expect(result.current.incomingCall).toBeNull();
    },
  );

  it('ignores unrelated notification types', async () => {
    const { result } = renderHook(() => useIncomingCallListener());
    await act(async () => {
      await realtimeCallback?.(incomingNotification({ type: 'sentiment_alert' }));
    });
    expect(result.current.incomingCall).toBeNull();
  });

  it('loads the contact only as backward-compatible fallback', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { name: 'Contato antigo', phone: '5511888888888' },
            error: null,
          }),
        }),
      }),
    });
    const { result } = renderHook(() => useIncomingCallListener());

    await act(async () => {
      await realtimeCallback?.(incomingNotification({
        metadata: {
          contact_id: 'contact-legacy',
          call_status: 'offer',
          is_video: true,
        },
      }));
    });

    expect(mockFrom).toHaveBeenCalledWith('contacts');
    expect(result.current.incomingCall?.contact_name).toBe('Contato antigo');
    expect(result.current.incomingCall?.is_video).toBe(true);
  });

  it('does not let a late legacy lookup overwrite a newer call', async () => {
    const legacyLookup = deferred<{ data: { name: string; phone: string }; error: null }>();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: vi.fn().mockReturnValue(legacyLookup.promise) }),
      }),
    });
    const { result } = renderHook(() => useIncomingCallListener());

    let legacyDelivery: Promise<void> | void = undefined;
    await act(async () => {
      legacyDelivery = realtimeCallback?.(incomingNotification({
        id: 'notification-old',
        metadata: { contact_id: 'contact-old', call_status: 'ringing' },
      }));
      await Promise.resolve();
    });
    await act(async () => {
      await realtimeCallback?.(incomingNotification({
        id: 'notification-new',
        metadata: {
          contact_id: 'contact-new',
          contact_name: 'Contato novo',
          phone: '5511777777777',
          call_status: 'ringing',
        },
      }));
    });
    await act(async () => {
      legacyLookup.resolve({ data: { name: 'Contato antigo', phone: '5511888888888' }, error: null });
      await legacyDelivery;
    });

    expect(result.current.incomingCall?.id).toBe('notification-new');
    expect(result.current.incomingCall?.contact_name).toBe('Contato novo');
  });

  it('does not commit an async fallback after subscription cleanup', async () => {
    const legacyLookup = deferred<{ data: { name: string; phone: string }; error: null }>();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ single: vi.fn().mockReturnValue(legacyLookup.promise) }),
      }),
    });
    const { unmount } = renderHook(() => useIncomingCallListener());

    const pendingDelivery = realtimeCallback?.(incomingNotification({
      id: 'notification-cleanup',
      metadata: { contact_id: 'contact-old', call_status: 'ringing' },
    }));
    unmount();
    await act(async () => {
      legacyLookup.resolve({ data: { name: 'Contato antigo', phone: '5511888888888' }, error: null });
      await pendingDelivery;
    });

    expect(mockLogInfo).not.toHaveBeenCalled();
  });

  it('removes its channel on unmount', () => {
    const channel = mockChannel();
    mockChannel.mockReturnValue(channel);
    const { unmount } = renderHook(() => useIncomingCallListener());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });
});
