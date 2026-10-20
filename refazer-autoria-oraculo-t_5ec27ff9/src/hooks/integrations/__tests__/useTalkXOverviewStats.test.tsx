import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * X077 — o hook da Visão geral lê os números de `talkx_overview_stats`:
 * período da barra de filtros (padrão 30 dias; "Todo o período" sem comparativo),
 * reconsulta a cada 30 s só com campanha ativa, campo ausente = null (nunca zero).
 */

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import {
  OVERVIEW_STATS_POLL_MS,
  parseOverviewStats,
  useTalkXOverviewStats,
} from '../useTalkXOverviewStats';

const AGORA = new Date('2026-10-09T15:00:00.000Z');

function resposta(active: number) {
  return {
    data: {
      current: { campaigns_sent: 5, completed: 3, contacts_reached: 120, sent: 150, delivery_rate_pct: 96.6 },
      previous: { campaigns_sent: 4, completed: 2, contacts_reached: 100, sent: 140, delivery_rate_pct: 94.5 },
      active,
      daily: [{ day: '2026-10-08', sent: 10 }, { day: '2026-10-09', sent: 25 }],
    },
    error: null,
  };
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

describe('useTalkXOverviewStats', () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
  });
  afterEach(() => vi.useRealTimers());

  it('chama talkx_overview_stats com o período da barra', async () => {
    rpc.mockResolvedValue(resposta(0));
    const range = { from: new Date('2026-10-03T03:00:00.000Z'), to: new Date('2026-10-09T23:59:59.999Z') };
    const { result } = renderHook(() => useTalkXOverviewStats('7d', range), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(rpc).toHaveBeenCalledWith('talkx_overview_stats', {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    });
    expect(result.current.data?.current.contactsReached).toBe(120);
    expect(result.current.data?.previous?.completed).toBe(2);
    expect(result.current.data?.dailySent).toEqual([10, 25]);
  });

  it('sem período escolhido usa os últimos 30 dias', async () => {
    rpc.mockResolvedValue(resposta(0));
    renderHook(() => useTalkXOverviewStats(null, null), { wrapper: wrapper() });

    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
    const args = rpc.mock.calls[0][1] as { p_from: string; p_to: string };
    const dias = (new Date(args.p_to).getTime() - new Date(args.p_from).getTime()) / 86_400_000;
    expect(dias).toBeGreaterThan(29);
    expect(dias).toBeLessThan(30);
  });

  it('"Todo o período" não traz comparativo', async () => {
    rpc.mockResolvedValue(resposta(0));
    const { result } = renderHook(() => useTalkXOverviewStats('all', null), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.previous).toBeNull();
  });

  it('reconsulta a cada 30 s com campanha ativa', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    rpc.mockResolvedValue(resposta(2));
    renderHook(() => useTalkXOverviewStats(null, null), { wrapper: wrapper() });

    await vi.advanceTimersByTimeAsync(100);
    expect(rpc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(OVERVIEW_STATS_POLL_MS);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('não reconsulta sem campanha ativa', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AGORA);
    rpc.mockResolvedValue(resposta(0));
    renderHook(() => useTalkXOverviewStats(null, null), { wrapper: wrapper() });

    await vi.advanceTimersByTimeAsync(100);
    expect(rpc).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(OVERVIEW_STATS_POLL_MS * 3);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('erro da RPC vira erro da consulta, não zero', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('falhou') });
    const { result } = renderHook(() => useTalkXOverviewStats(null, null), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('parseOverviewStats', () => {
  it('campo ausente fica null, nunca zero', () => {
    const s = parseOverviewStats({ current: { campaigns_sent: 1 } }, true);
    expect(s.current.campaignsSent).toBe(1);
    expect(s.current.contactsReached).toBeNull();
    expect(s.current.deliveryRatePct).toBeNull();
    expect(s.previous).toBeNull();
    expect(s.active).toBeNull();
    expect(s.dailySent).toEqual([]);
  });
});
