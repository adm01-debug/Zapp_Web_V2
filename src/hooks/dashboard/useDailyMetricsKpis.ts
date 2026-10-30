import { useQuery } from '@tanstack/react-query';
import { useCRMAdminAccess } from '@/hooks/crm/useCRMAdminAccess';
import { supabase } from '@/integrations/supabase/client';

/** Períodos do filtro de período do painel diário (7/30/90 dias). 90 é o teto que a
 * própria RPC aplica em p_days (intervalo [1, 90]), então pedir mais dias não traria
 * mais linhas. */
export const DAILY_KPIS_PERIODS = [7, 30, 90] as const;
export type DailyKpisDays = (typeof DAILY_KPIS_PERIODS)[number];
export const DAILY_KPIS_DEFAULT_DAYS: DailyKpisDays = 7;

/** Uma linha por dia civil de São Paulo, já com os dias sem movimento preenchidos
 * com 0 pela RPC — em ordem crescente. */
export interface DailyMetricRow {
  metric_date: string;
  messages_received: number;
  messages_sent: number;
  new_contacts: number;
  conversations_opened: number;
  conversations_resolved: number;
  active_contacts: number;
  /** Mediana de primeira resposta em segundos; null quando o dia não tem amostra de SLA. */
  median_response_time_seconds: number | null;
}

// dashboard_daily_series entrou no banco pela migration do cartão pai (t_d4a0a146),
// mas o types.ts gerado ainda não tem a RPC (não há generate_typescript_types neste
// projeto self-hosted, só o workflow types-sync). Cast local via 'unknown', igual
// dashboard_hourly_volume em useTodayHourlyVolume, até a sincronização.
type DashboardDailySeriesRpc = (
  fn: 'dashboard_daily_series',
  args: { p_days: number },
) => Promise<{ data: unknown; error: { message: string } | null }>;

function toCount(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza o que a RPC devolveu antes de virar gráfico: `numeric` (a mediana) chega
 * como STRING pelo PostgREST e não pode entrar num eixo numérico assim; a ordem é
 * reafirmada no cliente (a RPC já ordena, mas um dia fora de ordem inverteria o
 * gráfico). Resposta nula/fora do formato vira lista vazia em vez de quebrar a tela —
 * quem chama decide o que mostrar quando a série está vazia. */
export function normalizeDailyMetricRows(data: unknown): DailyMetricRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && typeof (row as Record<string, unknown>).metric_date === 'string' && (row as Record<string, unknown>).metric_date !== '',
    )
    .map((row) => ({
      metric_date: row.metric_date as string,
      messages_received: toCount(row.messages_received),
      messages_sent: toCount(row.messages_sent),
      new_contacts: toCount(row.new_contacts),
      conversations_opened: toCount(row.conversations_opened),
      conversations_resolved: toCount(row.conversations_resolved),
      active_contacts: toCount(row.active_contacts),
      median_response_time_seconds: toNumberOrNull(row.median_response_time_seconds),
    }))
    .sort((a, b) => (a.metric_date < b.metric_date ? -1 : a.metric_date > b.metric_date ? 1 : 0));
}

/** Série diária dos KPIs de atividade (DASHBOARD-03 / PB-22). Consulta a RPC
 * dashboard_daily_series, que agrega no servidor no fuso America/Sao_Paulo.
 *
 * Só staff habilita a consulta: `useCRMAdminAccess` chama is_admin_or_supervisor —
 * o MESMO predicado que a RPC usa no servidor (que ainda responde 42501 para quem
 * não é staff e nem EXECUTE dá para anon). Para quem não é staff a consulta nem sai
 * do navegador. `isStaff` vai no retorno porque false (sem permissão) e null (ainda
 * conferindo o papel) exigem telas diferentes de quem consome o hook.
 *
 * `days` entra na queryKey: trocar 7/30/90 no filtro de período refaz a consulta em
 * vez de reaproveitar o cache do período anterior. */
export function useDailyMetricsKpis(days: number = DAILY_KPIS_DEFAULT_DAYS) {
  const isStaff = useCRMAdminAccess();
  const query = useQuery({
    queryKey: ['dashboard', 'daily-metrics-kpis', days],
    queryFn: async (): Promise<DailyMetricRow[]> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as DashboardDailySeriesRpc;
      const { data, error } = await rpc('dashboard_daily_series', { p_days: days });
      if (error) throw error;
      return normalizeDailyMetricRows(data);
    },
    enabled: isStaff === true,
    staleTime: 120_000, // E28: série diária tolera 120s (não precisa de segundo a segundo)
  });
  return { ...query, isStaff };
}
