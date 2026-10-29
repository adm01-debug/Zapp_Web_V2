import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { resolvePeriodRange, type TalkXPeriodRange } from '@/components/talkx/kit/periods';

/** Chave de cache da visão geral: o tempo real invalida por este prefixo. */
export const TALKX_OVERVIEW_STATS_KEY = 'talkx-overview-stats';

/** Reconsulta enquanto houver campanha ativa; sem ativa, só o tempo real invalida. */
export const OVERVIEW_STATS_POLL_MS = 30_000;

/** "Todo o período": a RPC exige p_from, então o início é anterior a qualquer campanha. */
const ALL_PERIOD_FROM = '2020-01-01T00:00:00.000Z';

/** Campos de `current`/`previous`; ausente na resposta = `null`, nunca zero. */
export interface OverviewPeriodStats {
  campaignsSent: number | null;
  completed: number | null;
  contactsReached: number | null;
  sent: number | null;
  deliveryRatePct: number | null;
}

export interface TalkXOverviewStats {
  current: OverviewPeriodStats;
  /** `null` quando o servidor não tem período anterior ou quando o período é "Todo o período". */
  previous: OverviewPeriodStats | null;
  active: number | null;
  /** Envios por dia do período (zero-fill no servidor), base das barras. */
  dailySent: number[];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parsePeriod(raw: unknown): OverviewPeriodStats {
  const r = asRecord(raw);
  return {
    campaignsSent: num(r.campaigns_sent),
    completed: num(r.completed),
    contactsReached: num(r.contacts_reached),
    sent: num(r.sent),
    deliveryRatePct: num(r.delivery_rate_pct),
  };
}

export function parseOverviewStats(raw: unknown, withPrevious: boolean): TalkXOverviewStats {
  const r = asRecord(raw);
  const daily = Array.isArray(r.daily) ? r.daily : [];
  return {
    current: parsePeriod(r.current),
    previous: withPrevious && r.previous ? parsePeriod(r.previous) : null,
    active: num(r.active) ?? num(asRecord(r.current).active),
    dailySent: daily.map((d) => num(asRecord(d).sent) ?? 0),
  };
}

/**
 * Período efetivo da visão geral: o da barra de filtros; sem escolha, os últimos 30 dias;
 * "Todo o período" não tem comparativo (não existe período anterior a ele).
 */
export function resolveOverviewWindow(
  period: string | null,
  range: TalkXPeriodRange | null,
  now: Date = new Date(),
): { from: string; to: string; comparable: boolean } {
  if (range) return { from: range.from.toISOString(), to: range.to.toISOString(), comparable: true };
  if (period === 'all') return { from: ALL_PERIOD_FROM, to: now.toISOString(), comparable: false };
  const r = resolvePeriodRange('30d', now)!;
  return { from: r.from.toISOString(), to: r.to.toISOString(), comparable: true };
}

/** X077 — números da Visão geral vindos de `talkx_overview_stats`, sem conta no navegador. */
export function useTalkXOverviewStats(period: string | null, range: TalkXPeriodRange | null) {
  // O "agora" entra uma vez por escolha de período: a chave de cache não pode mudar a cada render.
  const win = useMemo(() => resolveOverviewWindow(period, range), [period, range]);

  return useQuery({
    queryKey: [TALKX_OVERVIEW_STATS_KEY, win.from, win.to, win.comparable],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('talkx_overview_stats', {
        p_from: win.from,
        p_to: win.to,
      });
      if (error) throw error;
      return parseOverviewStats(data, win.comparable);
    },
    refetchInterval: (query) => ((query.state.data?.active ?? 0) > 0 ? OVERVIEW_STATS_POLL_MS : false),
  });
}
