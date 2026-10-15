import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A janela de repetição do alerta de chamada recebida (T19).
 *
 * O provedor reenvia a mesma chamada com `event_id` novo — a chave da deduplicação é o `call_id`
 * do provedor —, mas o reenvio pode chegar MUITO depois, quando é outra ligação de verdade. A
 * janela de 35 s separa os dois: dentro dela, o mesmo `call_id` não toca de novo; passada a
 * janela, toca. Um comportamento "trava para sempre" engoliria a segunda ligação — por isso a
 * borda é testada dos dois lados.
 *
 * O arquivo irmão (`src/hooks/__tests__/useIncomingCallListener.test.tsx`) cobre assinatura,
 * metadados, dedupe imediato por `notification.id`, status terminal/fail-open e `call_id`.
 */

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
  logInfo: vi.fn(),
}));

let realtimeCallback: ((payload: Record<string, unknown>) => unknown) | undefined;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: (...args: unknown[]) => mocks.channel(...args),
    removeChannel: (...args: unknown[]) => mocks.removeChannel(...args),
    from: () => ({
      select: () => ({
        // Consulta de status da chamada: sem linha visível, o alerta toca (fail-open).
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/logger', () => ({
  log: { info: (...args: unknown[]) => mocks.logInfo(...args) },
}));

const { useIncomingCallListener } = await import('@/hooks/communication/useIncomingCallListener');

const CALL_ID = 'call-42';

function notificacao(id: string) {
  return {
    new: {
      id,
      user_id: 'user-1',
      type: 'incoming_call',
      message: 'Maria está ligando para você',
      created_at: '2026-10-15T19:00:00.000Z',
      metadata: {
        contact_id: 'contact-1',
        contact_name: 'Maria',
        phone: '5511999999999',
        call_status: 'ringing',
        call_id: CALL_ID,
      },
    },
  };
}

async function entregar(id: string) {
  await act(async () => {
    await realtimeCallback?.(notificacao(id));
  });
}

async function avancar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useIncomingCallListener — janela de repetição do mesmo call_id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeCallback = undefined;
    vi.useFakeTimers();
    mocks.channel.mockReturnValue({
      on: vi.fn((_evento, _config, callback: (payload: Record<string, unknown>) => unknown) => {
        realtimeCallback = callback;
        return mocks.channel.mock.results[mocks.channel.mock.results.length - 1]?.value;
      }),
      subscribe: vi.fn().mockReturnThis(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('repetição do mesmo call_id dentro da janela não toca de novo', async () => {
    const { result } = renderHook(() => useIncomingCallListener());

    await entregar('notificacao-1');
    expect(result.current.incomingCall?.callId).toBe(CALL_ID);
    act(() => result.current.dismissCall());

    await avancar(34_000);
    await entregar('notificacao-2');

    expect(result.current.incomingCall).toBeNull();
  });

  it('passada a janela, a mesma chamada volta a tocar (o reenvio tardio é outra ligação)', async () => {
    const { result } = renderHook(() => useIncomingCallListener());

    await entregar('notificacao-1');
    act(() => result.current.dismissCall());

    await avancar(35_000);
    await entregar('notificacao-2');

    expect(result.current.incomingCall?.callId).toBe(CALL_ID);
    expect(result.current.incomingCall?.id).toBe('notificacao-2');
  });
});
