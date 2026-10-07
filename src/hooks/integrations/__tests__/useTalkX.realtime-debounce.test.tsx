/**
 * R2-MOD-026 (#401) — regressão do debounce realtime de `talkx_campaigns`.
 *
 * O canal tinha UM único `debounceRef` para todas as campanhas: quando o
 * UPDATE de uma segunda campanha chegava dentro dos 500 ms, o timer pendente
 * da primeira era cancelado (clearTimeout) e só o último payload sobrevivia —
 * a atualização da campanha anterior era descartada. Como o indicador
 * "Ao vivo" (`isLive`) desliga o polling de fallback, a campanha descartada
 * ficava desatualizada em silêncio.
 *
 * Aceite do achado:
 *  - eventos intercalados de A e B dentro do debounce atualizam ambos;
 *  - a recuperação não depende de uma ação manual do operador.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => {
  const state = {
    subscribeCb: undefined as undefined | ((s: string) => void),
    updateCb: undefined as undefined | ((payload: unknown) => void),
    insertCb: undefined as undefined | ((payload: unknown) => void),
    selectResult: { data: [] as unknown[] },
  };
  const channel = { on: vi.fn(), subscribe: vi.fn() };
  const queryChain = { select: vi.fn(), order: vi.fn() };
  const supabase = { channel: vi.fn(), removeChannel: vi.fn(), from: vi.fn() };
  return { state, channel, queryChain, supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

import { useTalkX } from '../useTalkX';

const campaign = (id: string, sentCount: number) => ({
  id,
  name: `Campanha ${id}`,
  message_template: 'oi',
  variables_config: [],
  typing_delay_min: 1,
  typing_delay_max: 2,
  send_interval_min: 1,
  send_interval_max: 2,
  status: 'sending',
  total_recipients: 10,
  sent_count: sentCount,
  failed_count: 0,
  delivered_count: 0,
  whatsapp_connection_id: null,
  created_by: null,
  started_at: null,
  completed_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: null,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const flush = () => act(async () => {
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
  await Promise.resolve();
});

describe('useTalkX — debounce realtime por campanha (R2-MOD-026)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    h.state.subscribeCb = undefined;
    h.state.updateCb = undefined;
    h.state.insertCb = undefined;
    h.state.selectResult = { data: [] };
    h.channel.on.mockReset().mockImplementation(
      (_type: string, filter: unknown, cb: (p: unknown) => void) => {
        const event = (filter as { event?: string }).event;
        if (event === 'UPDATE') h.state.updateCb = cb;
        if (event === 'INSERT') h.state.insertCb = cb;
        return h.channel;
      },
    );
    h.channel.subscribe.mockReset().mockImplementation((cb?: (s: string) => void) => {
      h.state.subscribeCb = cb;
      return h.channel;
    });
    h.queryChain.select.mockReset().mockReturnValue(h.queryChain);
    h.queryChain.order.mockReset().mockImplementation(() => Promise.resolve(h.state.selectResult));
    h.supabase.from.mockReset().mockReturnValue(h.queryChain);
    h.supabase.channel.mockReset().mockReturnValue(h.channel);
    h.supabase.removeChannel.mockReset().mockResolvedValue('ok');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('aplica os dois UPDATEs intercalados (A e B) dentro da janela de debounce', async () => {
    h.state.selectResult = { data: [campaign('A', 0), campaign('B', 0)] };
    const { result } = renderHook(() => useTalkX(), { wrapper });
    await flush();
    expect(result.current.campaigns.map((c) => c.id)).toEqual(['A', 'B']);

    act(() => {
      // O canal chega "ao vivo": o polling de fallback é desligado.
      h.state.subscribeCb?.('SUBSCRIBED');
      // Rajada: UPDATE de A seguido (dentro de 500 ms) do UPDATE de B.
      h.state.updateCb?.({ new: { ...campaign('A', 1) } });
      h.state.updateCb?.({ new: { ...campaign('B', 1) } });
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    const sentById = Object.fromEntries(result.current.campaigns.map((c) => [c.id, c.sent_count]));
    // Antes da correção B era aplicado e A ficava em 0 (timer cancelado).
    expect(sentById).toEqual({ A: 1, B: 1 });
  });

  it('mantém a campanha atualizada após vários UPDATEs intercalados em rajada', async () => {
    h.state.selectResult = { data: [campaign('A', 0), campaign('B', 0)] };
    const { result } = renderHook(() => useTalkX(), { wrapper });
    await flush();

    act(() => {
      h.state.updateCb?.({ new: { ...campaign('A', 1) } });
      h.state.updateCb?.({ new: { ...campaign('B', 1) } });
      h.state.updateCb?.({ new: { ...campaign('A', 2) } });
      h.state.updateCb?.({ new: { ...campaign('B', 2) } });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });

    const sentById = Object.fromEntries(result.current.campaigns.map((c) => [c.id, c.sent_count]));
    // O último valor recebido de cada campanha vence (A=2 e B=2).
    expect(sentById).toEqual({ A: 2, B: 2 });
  });
});
