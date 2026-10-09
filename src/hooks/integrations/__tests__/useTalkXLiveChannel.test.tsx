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
  const state = {
    subscribeCb: undefined as undefined | ((status: string) => void),
    eventCbs: [] as Array<(payload: unknown) => void>,
  };
  const channel = { on: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() };
  const supabase = { channel: vi.fn(), removeChannel: vi.fn() };
  return { state, channel, supabase };
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

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  h.state.subscribeCb = undefined;
  h.state.eventCbs = [];
  h.channel.on.mockReset().mockImplementation((_type: string, _filter: unknown, cb: (payload: unknown) => void) => {
    h.state.eventCbs.push(cb);
    return h.channel;
  });
  h.channel.subscribe.mockReset().mockImplementation((cb?: (status: string) => void) => {
    h.state.subscribeCb = cb;
    return h.channel;
  });
  h.channel.unsubscribe.mockReset();
  h.supabase.channel.mockReset().mockReturnValue(h.channel);
  h.supabase.removeChannel.mockReset().mockResolvedValue('ok');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTalkXLiveChannel — tempo real e modo degradado (X144)', () => {
  it('abre UM canal com as três tabelas do acompanhamento desta campanha', () => {
    renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    expect(h.supabase.channel).toHaveBeenCalledTimes(1);
    const tables = h.channel.on.mock.calls.map((call) => (call[1] as { table: string }).table);
    expect(tables).toEqual(['talkx_campaigns', 'talkx_recipients', 'talkx_campaign_events']);
    // Cada inscrição filtra pela campanha aberta: nada de outro registro na tela.
    for (const call of h.channel.on.mock.calls) {
      expect((call[1] as { filter: string }).filter).toMatch(/^(id|campaign_id)=eq\.camp-1$/);
    }
  });

  it('SUBSCRIBED → estado `live` e polling DESLIGADO', () => {
    const { result } = renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      h.state.subscribeCb?.('SUBSCRIBED');
    });

    expect(result.current.status).toBe('live');
    expect(result.current.live).toBe(true);
    expect(result.current.panelPollMs).toBeNull();
    expect(result.current.tablePollMs).toBeNull();
  });

  it('CHANNEL_ERROR → estado `degraded`, polling ligado (10 s no painel, 15 s na tabela) e reconexão em espera crescente', async () => {
    const { result } = renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      h.state.subscribeCb?.('CHANNEL_ERROR');
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

    // Segunda falha espera 2 s (espera crescente, teto de 30 s).
    act(() => {
      h.state.subscribeCb?.('CHANNEL_ERROR');
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
      h.state.subscribeCb?.('SUBSCRIBED');
    });
    expect(result.current.status).toBe('live');
    expect(result.current.panelPollMs).toBeNull();
  });

  it('50 eventos em 1 s geram UMA passagem de invalidação, só das leituras desta campanha', async () => {
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    renderHook(() => useTalkXLiveChannel('camp-1'), { wrapper });

    act(() => {
      h.state.subscribeCb?.('SUBSCRIBED');
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
      h.state.subscribeCb?.('SUBSCRIBED');
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

  it('o selo único troca de texto quando o tempo real cai', () => {
    expect(talkxLiveBadgeText('live')).toBe('Ao vivo');
    expect(talkxLiveBadgeText('degraded')).toBe('Tempo real indisponível — atualizando a cada 10 s');
    expect(talkxLiveBadgeText('offline')).toBe('Tempo real indisponível — atualizando a cada 10 s');
  });
});
