/**
 * X144 — canal único por campanha, com tempo real e modo degradado.
 *
 * Aceite da etapa (docs/talkx/v4/etapas/F11-acompanhar-campanha.md, X144):
 *  - `CHANNEL_ERROR` → estado `degraded` e polling ligado;
 *  - `SUBSCRIBED` → polling desligado;
 *  - 50 eventos em 1 s → 1 invalidação.
 *
 * Antes deste hook não havia nada disso: cada bloco abria o próprio canal, uma
 * rajada de eventos refazia as leituras uma a uma e o selo "Ao vivo" era texto
 * fixo — com a inscrição caída a tela continuava dizendo que estava ao vivo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => {
  type MockChannel = {
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
  };
  const state = {
    subscribeCbs: [] as Array<(status: string) => void>,
    eventCbs: [] as Array<(payload: unknown) => void>,
    channels: [] as MockChannel[],
    channelCallbacks: new Map<MockChannel, Array<(status: string) => void>>(),
  };
  const makeChannel = (): MockChannel => {
    const channel = {
      on: vi.fn((_type: string, _filter: unknown, cb: (payload: unknown) => void) => {
        state.eventCbs.push(cb);
        return channel;
      }),
      subscribe: vi.fn((cb?: (status: string) => void) => {
        if (cb) {
          const cbs = state.channelCallbacks.get(channel) ?? [];
          cbs.push(cb);
          state.channelCallbacks.set(channel, cbs);
          state.subscribeCbs.push(cb);
        }
        return channel;
      }),
      unsubscribe: vi.fn(),
    };
    return channel;
  };
  const supabase = { channel: vi.fn(), removeChannel: vi.fn() };
  return { state, makeChannel, supabase };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));
// Tópico exclusivo por instância tem cobertura própria; aqui o nome fixo deixa
// a asserção de "quantos canais foram abertos" legível.
vi.mock('@/lib/realtimeTopic', () => ({ uniqueRealtimeTopic: (base: string) => base }));

import {
  useTalkXLiveChannel,
  isTalkXLiveQueryKey,
  reconnectDelayMs,
  talkxLiveBadgeText,
  TALKX_DEGRADED_PANEL_MS,
  TALKX_DEGRADED_TABLE_MS,
} from '../useTalkXLiveChannel';

let client: QueryClient;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

function emitSubscribe(status: string, index = h.state.subscribeCbs.length - 1) {
  h.state.subscribeCbs[index]?.(status);
}

beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.state.subscribeCbs = [];
  h.state.eventCbs = [];
  h.state.channels = [];
  h.state.channelCallbacks.clear();
  h.supabase.channel.mockReset().mockImplementation(() => {
    const channel = h.makeChannel();
    h.state.channels.push(channel);
    return channel;
  });
  h.supabase.removeChannel.mockReset().mockImplementation((ch) => {
    const cbs = h.state.channelCallbacks.get(ch) ?? [];
    cbs.forEach((cb) => cb('CLOSED'));
    return Promise.resolve('ok');
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTalkXLiveChannel — tempo real e modo degradado (X144)', () => {
  it('abre UM canal com as três tabelas do acompanhamento desta campanha', () => {
    renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    expect(h.supabase.channel).toHaveBeenCalledTimes(1);
    const tables = h.state.channels[0].on.mock.calls.map((call) => (call[1] as { table: string }).table);
    expect(tables).toEqual(['talkx_campaigns', 'talkx_recipients', 'talkx_campaign_events']);
    // Cada inscrição filtra pela campanha aberta: nada de outro registro na tela.
    for (const call of h.state.channels[0].on.mock.calls) {
      expect((call[1] as { filter: string }).filter).toMatch(/^(id|campaign_id)=eq\.camp-1$/);
    }
  });

  it('SUBSCRIBED → estado `live` e polling DESLIGADO', () => {
    const { result } = renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      emitSubscribe('SUBSCRIBED');
    });

    expect(result.current.status).toBe('live');
    expect(result.current.live).toBe(true);
    expect(result.current.panelPollMs).toBeNull();
    expect(result.current.tablePollMs).toBeNull();
  });

  it('CHANNEL_ERROR → estado `degraded`, polling ligado (10 s no painel, 15 s na tabela) e reconexão em espera crescente', async () => {
    const { result } = renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      emitSubscribe('CHANNEL_ERROR');
    });

    expect(result.current.status).toBe('degraded');
    expect(result.current.degraded).toBe(true);
    expect(result.current.panelPollMs).toBe(TALKX_DEGRADED_PANEL_MS);
    expect(result.current.tablePollMs).toBe(TALKX_DEGRADED_TABLE_MS);
    expect(result.current.live).toBe(false);

    // Primeira espera = 1 s; só depois disso uma nova tentativa de inscrição.
    expect(h.supabase.channel).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(h.supabase.channel).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(h.supabase.channel).toHaveBeenCalledTimes(2);
    expect(h.supabase.removeChannel).toHaveBeenCalledWith(h.state.channels[0]);

    // Segunda falha espera 2 s (espera crescente, teto de 30 s).
    act(() => {
      emitSubscribe('CHANNEL_ERROR');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_999);
    });
    expect(h.supabase.channel).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(h.supabase.channel).toHaveBeenCalledTimes(3);

    // Ao reconectar, o estado volta a `live` e o polling desliga.
    act(() => {
      emitSubscribe('SUBSCRIBED');
    });
    expect(result.current.status).toBe('live');
    expect(result.current.panelPollMs).toBeNull();
  });

  it('remove o canal anterior antes de reconectar e ignora callbacks velhos', async () => {
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      emitSubscribe('CHANNEL_ERROR');
    });
    expect(result.current.status).toBe('degraded');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });

    expect(h.supabase.channel).toHaveBeenCalledTimes(2);
    expect(h.supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(h.supabase.removeChannel).toHaveBeenCalledWith(h.state.channels[0]);

    act(() => {
      emitSubscribe('SUBSCRIBED', 0);
      h.state.eventCbs[0]({ new: { id: 'old-event' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });

    expect(result.current.status).toBe('degraded');
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('CLOSED entra em offline, remove o canal fechado e agenda reconexão', async () => {
    const { result } = renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      emitSubscribe('CLOSED');
    });

    expect(result.current.status).toBe('offline');
    expect(result.current.offline).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });

    expect(h.supabase.channel).toHaveBeenCalledTimes(2);
    expect(h.supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(h.supabase.removeChannel).toHaveBeenCalledWith(h.state.channels[0]);
  });

  it('removeChannel síncrono com CLOSED no canal antigo não corrompe a nova conexão', async () => {
    const { result } = renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      emitSubscribe('CHANNEL_ERROR');
    });
    expect(result.current.status).toBe('degraded');

    // 1 s depois o hook tenta reconectar — removeChannel é chamado no canal antigo
    // e, com o mock de beforeEach, dispara CLOSED sincronamente no callback velho.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });

    // A segunda tentativa criou um novo canal; o CLOSED síncrono do velho não
    // deve ter mudado o status para offline nem disparado reconexão extra.
    expect(result.current.status).toBe('degraded');
    expect(h.supabase.channel).toHaveBeenCalledTimes(2);

    // Avançando 5 s sem novo erro, o hook não tenta reconectar de novo.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(h.supabase.channel).toHaveBeenCalledTimes(2);
  });

  it('50 eventos em 1 s geram UMA passagem de invalidação, só das leituras desta campanha', async () => {
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      emitSubscribe('SUBSCRIBED');
    });
    expect(h.state.eventCbs).toHaveLength(3);

    act(() => {
      for (let i = 0; i < 50; i += 1) {
        h.state.eventCbs[i % h.state.eventCbs.length]({ new: { id: `r-${i}` } });
      }
    });

    // Antes de fechar a janela de 1 s nada foi invalidado (o lote está aberto).
    expect(invalidateSpy).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_001);
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    const filters = invalidateSpy.mock.calls[0][0] as unknown as {
      predicate: (q: { queryKey: readonly unknown[] }) => boolean;
    };
    expect(filters.predicate({ queryKey: ['talkx-monitor-panel', 'camp-1'] })).toBe(true);
    expect(filters.predicate({ queryKey: ['talkx-recipients-page', 'camp-1', 'all'] })).toBe(true);
    // Outra campanha e outras leituras do módulo ficam de fora.
    expect(filters.predicate({ queryKey: ['talkx-monitor-panel', 'camp-2'] })).toBe(false);
    expect(filters.predicate({ queryKey: ['talkx-templates'] })).toBe(false);

    // Sem eventos novos, nada mais é invalidado.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('desmontar fecha o canal e cancela o lote pendente', async () => {
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const { unmount } = renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      emitSubscribe('SUBSCRIBED');
      h.state.eventCbs[0]({ new: { id: 'r-1' } });
    });

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(h.supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('sem campanha não abre canal e assume `offline`', () => {
    const { result } = renderHook(() => useTalkXLiveChannel(null), { wrapper });

    expect(h.supabase.channel).not.toHaveBeenCalled();
    expect(result.current.status).toBe('offline');
    expect(result.current.offline).toBe(true);
    // Mesmo offline a tela continua atualizando — só não em tempo real.
    expect(result.current.panelPollMs).toBe(TALKX_DEGRADED_PANEL_MS);
  });
});

describe('useTalkXLiveChannel — auxiliares', () => {
  it('o filtro de invalidação aceita só as leituras da campanha (raiz da chave)', () => {
    expect(isTalkXLiveQueryKey(['talkx-events', 'camp-1'], 'camp-1')).toBe(true);
    expect(isTalkXLiveQueryKey(['talkx-events', 'camp-1'], 'camp-2')).toBe(false);
    expect(isTalkXLiveQueryKey(['talkx-events'], 'camp-1')).toBe(false);
    expect(isTalkXLiveQueryKey('talkx-events' as unknown as readonly unknown[], 'camp-1')).toBe(false);
  });

  it('a espera cresce até o teto de 30 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 99].map(reconnectDelayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  it('o selo único diferencia conexão, queda e intervalos degradados reais', () => {
    expect(talkxLiveBadgeText('live')).toBe('Ao vivo');
    expect(talkxLiveBadgeText('connecting')).toBe('Conectando…');
    expect(talkxLiveBadgeText('degraded')).toBe('Tempo real indisponível — painel a cada 10 s, tabela a cada 15 s');
    expect(talkxLiveBadgeText('offline')).toBe('Tempo real indisponível — painel a cada 10 s, tabela a cada 15 s');
  });
});
