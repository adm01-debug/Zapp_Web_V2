import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays } from 'date-fns';

type ClosureRow = { created_at: string };
type SlaRow = { first_message_at: string; first_response_at: string | null; first_response_breached: boolean | null };
const H = 3_600_000;
/** Amostra mínima por dia p/ mostrar "% vs ontem" (E19) — abaixo disso, 1 outlier
 * já produz deltas fantasmas tipo "-100%" (achado A10). Sem delta é mais honesto que delta errado. */
const MIN_SAMPLE_FOR_DELTA = 5;

/** p50/p90 por interpolação linear (método comum, mesmo de percentile_cont do Postgres). */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

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
  // Mediana (p50), não média: 1 atendimento respondido 10h depois não pode dobrar
  // o KPI do dia (achado A10). p90 fica só pro tooltip, não entra no card nem no delta.
  const median = (rows: SlaRow[]) => (rows.length ? Math.round(percentile(rows.map(rt), 50)) : null);
  const avgT = median(aT); const avgY = median(aY);
  const p90Today = aT.length ? Math.round(percentile(aT.map(rt), 90)) : null;
  return {
    resolvedToday: cT.length,
    resolvedYesterday: cY.length,
    deltaResolvedPct: cT.length >= MIN_SAMPLE_FOR_DELTA && cY.length >= MIN_SAMPLE_FOR_DELTA ? pct(cT.length, cY.length) : null,
    resolvedHourly8: bucket8(cT.map((r) => Date.parse(r.created_at))),
    avgResponseToday: avgT,
    avgResponseYesterday: avgY,
    p90ResponseToday: p90Today,
    deltaResponsePct: avgT !== null && avgY !== null && aT.length >= MIN_SAMPLE_FOR_DELTA && aY.length >= MIN_SAMPLE_FOR_DELTA ? pct(avgT, avgY) : null,
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
