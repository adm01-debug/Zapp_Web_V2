import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** A05 — lembrar da mensagem (`useRemindMessage`): envia a data/hora escolhida e
 *  traduz as bordas de tempo (no passado, acima de 90 dias). */

const h = vi.hoisted(() => ({
  rpcResult: null as { data: unknown; error: { message: string; code?: string } | null } | null,
  rpcCalls: [] as Array<{ fn: string; args?: Record<string, unknown> }>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      h.rpcCalls.push({ fn, args });
      return Promise.resolve(h.rpcResult ?? { data: null, error: null });
    },
    from: () => { const c: Record<string, unknown> = {}; c.select = () => c; c.eq = () => c; return c; },
    channel: () => { const c: Record<string, unknown> = {}; c.on = () => c; c.subscribe = () => c; return c; },
    removeChannel: vi.fn(),
  },
}));

import { toast } from 'sonner';
import { useRemindMessage } from '@/hooks/chat/useRemindMessage';

let queryClient: QueryClient;
const wrapper = () => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

function montar() {
  return renderHook(() => useRemindMessage(), { wrapper: wrapper() });
}

beforeEach(() => {
  h.rpcResult = null;
  h.rpcCalls = [];
  vi.clearAllMocks();
});

describe('useRemindMessage', () => {
  it('cria o lembrete com a data em ISO e a nota', async () => {
    h.rpcResult = { data: 'task-1', error: null };
    const { result } = montar();

    await act(async () => {
      await result.current.remind('m1', new Date('2026-10-12T13:00:00.000Z'), 'responder depois');
    });

    expect(h.rpcCalls).toEqual([
      {
        fn: 'remind_me_about_message',
        args: { p_message_id: 'm1', p_remind_at: '2026-10-12T13:00:00.000Z', p_note: 'responder depois' },
      },
    ]);
  });

  it('traduz a data no passado', async () => {
    h.rpcResult = { data: null, error: { message: 'remind_at_in_past', code: '22023' } };
    const { result } = montar();

    await act(async () => {
      await expect(result.current.remind('m1', '2020-01-01T00:00:00.000Z')).rejects.toBeTruthy();
    });

    expect(toast.error).toHaveBeenCalledWith('Escolha uma data futura para o lembrete');
  });

  it('traduz a data acima de 90 dias', async () => {
    h.rpcResult = { data: null, error: { message: 'remind_at_too_far', code: '22023' } };
    const { result } = montar();

    await act(async () => {
      await expect(result.current.remind('m1', '2030-01-01T00:00:00.000Z')).rejects.toBeTruthy();
    });

    expect(toast.error).toHaveBeenCalledWith('O lembrete pode ser no máximo 90 dias à frente');
  });

  it('traduz a falta de permissão sobre a mensagem', async () => {
    h.rpcResult = { data: null, error: { message: 'message_not_visible', code: '42501' } };
    const { result } = montar();

    await act(async () => {
      await expect(result.current.remind('m1', '2026-10-12T13:00:00.000Z')).rejects.toBeTruthy();
    });

    expect(toast.error).toHaveBeenCalledWith('Você não tem permissão para esta ação nesta mensagem');
  });
});
