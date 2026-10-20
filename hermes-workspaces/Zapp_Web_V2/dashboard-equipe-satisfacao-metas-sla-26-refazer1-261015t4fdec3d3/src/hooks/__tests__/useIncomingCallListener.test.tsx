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
          // T19: consulta de status da chamada — sem linha visível, o alerta
          // toca (fail-open).
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
  });

  /** T19: resposta do banco para a consulta de status da chamada do `call_id`. */
  function mockCallsStatus(status: string | null, error: { message: string } | null = null) {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: status === null ? null : { status }, error }),
        }),
      }),
    });
  }

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
      callId: null,
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

  it('propagates the real call id from notification metadata (not the notification row id)', async () => {
    const { result } = renderHook(() => useIncomingCallListener());
    await act(async () => {
      await realtimeCallback?.(incomingNotification({
        metadata: {
          contact_id: 'contact-1',
          contact_name: 'Maria',
          phone: '5511999999999',
          call_status: 'ringing',
          call_id: 'call-42',
        },
      }));
    });

    expect(result.current.incomingCall?.id).toBe('notification-1');
    expect(result.current.incomingCall?.callId).toBe('call-42');
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

  // === T19: identidade por `call_id` e chamada já encerrada ===

  function metadataComCallId(extra: Record<string, unknown> = {}) {
    return {
      contact_id: 'contact-1',
      contact_name: 'Maria',
      phone: '5511999999999',
      call_status: 'ringing',
      call_id: 'call-42',
      ...extra,
    };
  }

  it('T19: duas notificações do mesmo call_id (event_ids diferentes) viram UM alerta', async () => {
    // É o caso real do provedor: reenvia a mesma chamada com `event_id` novo.
    // Antes, a chave da deduplicação era só o `event_id` — tocava duas vezes.
    const { result } = renderHook(() => useIncomingCallListener());

    await act(async () => {
      await realtimeCallback?.(
        incomingNotification({
          id: 'notification-a',
          metadata: metadataComCallId({ event_id: 'provider-event-1' }),
        }),
      );
    });
    act(() => result.current.dismissCall());
    await act(async () => {
      await realtimeCallback?.(
        incomingNotification({
          id: 'notification-b',
          metadata: metadataComCallId({ event_id: 'provider-event-2' }),
        }),
      );
    });

    expect(result.current.incomingCall).toBeNull();
    expect(mockLogInfo).toHaveBeenCalledTimes(1);
  });

  it('T19: chamada já encerrada no banco não toca alerta', async () => {
    mockCallsStatus('ended');
    const { result } = renderHook(() => useIncomingCallListener());

    await act(async () => {
      await realtimeCallback?.(incomingNotification({ metadata: metadataComCallId() }));
    });

    // A consulta é pelo id da chamada (não pelo id da notificação).
    expect(mockFrom).toHaveBeenCalledWith('calls');
    expect(mockFrom.mock.results[0].value.select).toHaveBeenCalledWith('status');
    expect(mockFrom.mock.results[0].value.select.mock.results[0].value.eq).toHaveBeenCalledWith(
      'id',
      'call-42',
    );
    expect(result.current.incomingCall).toBeNull();
    expect(mockLogInfo).not.toHaveBeenCalled();
  });

  it.each(['missed', 'failed', 'cancelled', 'declined', 'busy'])(
    'T19: status terminal %s também não toca alerta',
    async (status) => {
      mockCallsStatus(status);
      const { result } = renderHook(() => useIncomingCallListener());

      await act(async () => {
        await realtimeCallback?.(incomingNotification({ metadata: metadataComCallId() }));
      });

      expect(result.current.incomingCall).toBeNull();
    },
  );

  it('T19: chamada viva (ringing) continua tocando o alerta', async () => {
    mockCallsStatus('ringing');
    const { result } = renderHook(() => useIncomingCallListener());

    await act(async () => {
      await realtimeCallback?.(incomingNotification({ metadata: metadataComCallId() }));
    });

    expect(result.current.incomingCall?.callId).toBe('call-42');
  });

  it('T19: erro ao consultar o status não engole a ligação (fail-open)', async () => {
    mockCallsStatus(null, { message: 'permission denied' });
    const { result } = renderHook(() => useIncomingCallListener());

    await act(async () => {
      await realtimeCallback?.(incomingNotification({ metadata: metadataComCallId() }));
    });

    expect(result.current.incomingCall?.callId).toBe('call-42');
    expect(mockLogInfo).toHaveBeenCalledTimes(1);
  });

  it('T19: sem call_id não consulta o banco (legado segue como antes)', async () => {
    const { result } = renderHook(() => useIncomingCallListener());

    await act(async () => {
      await realtimeCallback?.(incomingNotification());
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.incomingCall?.id).toBe('notification-1');
  });
});
