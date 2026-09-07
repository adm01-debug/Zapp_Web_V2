import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays } from 'date-fns';

type ClosureRow = { created_at: string };
type SlaRow = { first_message_at: string; first_response_at: string | null; first_response_breached: boolean | null };
const H = 3_600_000;

/**
 * responseHourly8 (KPI "Tempo Médio de Resposta") é lido visualmente invertido:
 * barras menores = melhor desempenho (resposta mais rápida).
 */
export function aggregateDashboardKpi(closures: ClosureRow[], sla: SlaRow[], now = new Date()) {
  const t0 = startOfDay(now).getTime(); const y0 = startOfDay(subDays(now, 1)).getTime();
  const isToday = (iso: string) => Date.parse(iso) >= t0;
  const isYesterday = (iso: string) => { const t = Date.parse(iso); return t >= y0 && t < t0; };
  const pct = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) / prev) * 100));
  const bucket8 = (times: number[], weight?: number[]) => {
    const sum = Array(8).fill(0); const cnt = Array(8).fill(0);
    times.forEach((t, i) => { const b = Math.min(7, Math.floor((t - t0) / (3 * H))); sum[b] += weight ? weight[i] : 1; cnt[b] += 1; });
    return weight ? sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0)) : sum;
  };
  const cT = closures.filter((r) => isToday(r.created_at));
  const cY = closures.filter((r) => isYesterday(r.created_at));
  const answered = sla.filter((r) => r.first_response_at);
  const rt = (r: SlaRow) => (Date.parse(r.first_response_at!) - Date.parse(r.first_message_at)) / 1000;
  const aT = answered.filter((r) => isToday(r.first_message_at));
  const aY = answered.filter((r) => isYesterday(r.first_message_at));
  const avg = (rows: SlaRow[]) => (rows.length ? Math.round(rows.reduce((a, r) => a + rt(r), 0) / rows.length) : null);
  const avgT = avg(aT); const avgY = avg(aY);
  return {
    resolvedToday: cT.length,
    resolvedYesterday: cY.length,
    deltaResolvedPct: pct(cT.length, cY.length),
    resolvedHourly8: bucket8(cT.map((r) => Date.parse(r.created_at))),
    avgResponseToday: avgT,
    avgResponseYesterday: avgY,
    deltaResponsePct: avgT !== null && avgY !== null ? pct(avgT, avgY) : null,
    responseHourly8: bucket8(aT.map((r) => Date.parse(r.first_message_at)), aT.map(rt)),
    slaBreachedToday: sla.filter((r) => isToday(r.first_message_at) && r.first_response_breached === true).length,
  };
}

export function useDashboardKpi() {
  return useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: async () => {
      const since = startOfDay(subDays(new Date(), 1)).toISOString();
      const [c, s] = await Promise.all([
        supabase.from('conversation_closures').select('created_at').gte('created_at', since),
        supabase.from('conversation_sla').select('first_message_at, first_response_at, first_response_breached').gte('first_message_at', since),
      ]);
      if (c.error) throw c.error;
      if (s.error) throw s.error;
      return aggregateDashboardKpi((c.data ?? []) as ClosureRow[], (s.data ?? []) as SlaRow[]);
    },
    staleTime: 60_000,
  });
}
