import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, subDays } from 'date-fns';

/** Amostra mínima por dia p/ mostrar "% vs ontem" (E19) — abaixo disso, 1 outlier
 * já produz deltas fantasmas tipo "-100%" (achado A10). Sem delta é mais honesto
 * que delta errado. */
const MIN_SAMPLE_FOR_DELTA = 5;

/** Shape devolvido pela RPC dashboard_kpi (E23): contagens, mediana/p90 (via
 * percentile_cont) e buckets de 3h já agregados no servidor — substitui os 2
 * fetches crus (conversation_closures/conversation_sla) + agregação client-side
 * que existiam antes do E23. */
export type DashboardKpiRpcResult = {
  resolvedToday: number;
  resolvedYesterday: number;
  resolvedHourly8: number[];
  avgResponseToday: number | null;
  avgResponseYesterday: number | null;
  p90ResponseToday: number | null;
  responseHourly8: number[];
  slaBreachedToday: number;
  answeredTodayCount: number;
  answeredYesterdayCount: number;
};

/** Fila/agente do filtro do topo (E31) — propagados como p_queue/p_agent para
 * a RPC. Para não-staff, dashboard_kpi trava p_agent = auth.uid() no servidor
 * (E33), então passar outro agentId aqui não vaza dado de terceiro mesmo se o
 * front tiver algum bug de visibilidade do filtro. */
export interface DashboardKpiFilters {
  queueId?: string | null;
  agentId?: string | null;
}

function pct(cur: number, prev: number): number | null {
  return prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
}

/** Só aplica o guard de amostra mínima (E19) sobre o que a RPC já agregou — dia/hora,
 * mediana e p90 são calculados no banco (dashboard_kpi, SECURITY INVOKER). Mantém o
 * mesmo shape de saída de antes do E23 — DashboardKpiRow.tsx não precisa mudar. */
export function aggregateDashboardKpi(r: DashboardKpiRpcResult) {
  const deltaResolvedPct =
    r.resolvedToday >= MIN_SAMPLE_FOR_DELTA && r.resolvedYesterday >= MIN_SAMPLE_FOR_DELTA
      ? pct(r.resolvedToday, r.resolvedYesterday)
      : null;
  const deltaResponsePct =
    r.avgResponseToday !== null &&
    r.avgResponseYesterday !== null &&
    r.answeredTodayCount >= MIN_SAMPLE_FOR_DELTA &&
    r.answeredYesterdayCount >= MIN_SAMPLE_FOR_DELTA
      ? pct(r.avgResponseToday, r.avgResponseYesterday)
      : null;

  return {
    resolvedToday: r.resolvedToday,
    resolvedYesterday: r.resolvedYesterday,
    deltaResolvedPct,
    resolvedHourly8: r.resolvedHourly8,
    avgResponseToday: r.avgResponseToday,
    avgResponseYesterday: r.avgResponseYesterday,
    p90ResponseToday: r.p90ResponseToday,
    deltaResponsePct,
    responseHourly8: r.responseHourly8,
    slaBreachedToday: r.slaBreachedToday,
  };
}

export function useDashboardKpi(filters: DashboardKpiFilters = {}) {
  const { queueId = null, agentId = null } = filters;
  return useQuery({
    // E31: fila/agente entram na queryKey — trocar o filtro do topo tem que
    // invalidar o cache do KPI (antes o dropdown era cosmético p/ este card, A9).
    queryKey: ['dashboard-kpi', queueId, agentId],
    queryFn: async () => {
      const since = startOfDay(subDays(new Date(), 1)).toISOString();
      // cast temporário: types.ts gerado ainda não tem dashboard_kpi (RPC nova, E23) — sync automático (PR #703) traz o tipo real em breve.
      const { data, error } = await (supabase as any).rpc('dashboard_kpi', { // eslint-disable-line @typescript-eslint/no-explicit-any -- cast temporário até sync de types (PR #703)
        p_since: since,
        p_queue: queueId,
        p_agent: agentId,
      });
      if (error) throw error;
      return aggregateDashboardKpi(data as unknown as DashboardKpiRpcResult);
    },
    staleTime: 60_000,
  });
}
