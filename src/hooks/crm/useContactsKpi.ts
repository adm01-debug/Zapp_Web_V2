import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CONTACTS_AGGREGATE_QUERY_OPTIONS, CONTACT_VISIBLE_PHONE_PATTERN } from './contactsAggregates';

const DAY = 86_400_000;

/** Mínimo de registros no período anterior para exibir delta. Abaixo disso retorna null. */
const MIN_PREV = 50;

/**
 * Contrato de `public.contacts_stats(boolean)` (migration 20261013010929_contacts_stats.sql).
 * Os agregados são calculados no servidor — o navegador não recebe linhas de contato.
 */
type ContactsStats = {
  total: number;
  recent_30d: number;
  base_30d: number;
  growth_30d_pct: number | null;
  duplicate_candidates: number;
  /** NULL enquanto a fila de exclusão LGPD (LG1) não existir. */
  lgpd_pending: number | null;
};

/**
 * Contrato de `public.contacts_stats_series(boolean)`
 * (migration 20261013235904_contacts_stats_series.sql).
 */
type ContactsStatsSeries = {
  empresas_distinct: number;
  series_novos_daily_30: number[];
  series_total_cumulative_12w: number[];
  series_empresas_cumulative_12w: number[];
  series_fornecedores_weekly_12: number[];
};

export type ContactsKpi = {
  novos30: number;
  novosPrev30: number;
  deltaNovosPct: number | null;
  deltaTotalPct: number | null;
  empresasDistinct: number;
  fornecedores30: number;
  deltaFornecedoresPct: number | null;
  duplicateCandidates: number;
  lgpdPending: number | null;
  seriesTotalCumulative12w: number[];
  seriesNovosDaily30: number[];
  seriesEmpresasCumulative12w: number[];
  seriesFornecedoresWeekly12: number[];
};

/** Arredonda como o `aggregateKpi` histórico; base vazia não vira divisão por zero. */
function pct(cur: number, prev: number): number {
  return prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
}

/** Delta só é exibido quando o período anterior tem amostra suficiente (piso MIN_PREV). */
function pctOrNull(cur: number, prev: number): number | null {
  return prev < MIN_PREV ? null : pct(cur, prev);
}

/**
 * Monta o KPI a partir das duas RPCs. `novosPrev30`, `fornecedores30` e `fornecedoresPrev30`
 * são contagens exatas do período anterior calculadas no PostgREST (`count: 'exact',
 * head: true`) — nenhuma linha de contato trafega para o cliente.
 */
export function kpiFromServer(
  stats: ContactsStats,
  series: ContactsStatsSeries,
  windows: { novosPrev30: number; fornecedores30: number; fornecedoresPrev30: number },
): ContactsKpi {
  const novos30 = stats.recent_30d;
  const prevTotal = stats.total - stats.recent_30d;
  return {
    novos30,
    novosPrev30: windows.novosPrev30,
    deltaNovosPct: pctOrNull(novos30, windows.novosPrev30),
    deltaTotalPct: pctOrNull(stats.total, prevTotal),
    empresasDistinct: series.empresas_distinct,
    fornecedores30: windows.fornecedores30,
    deltaFornecedoresPct: pctOrNull(windows.fornecedores30, windows.fornecedoresPrev30),
    duplicateCandidates: stats.duplicate_candidates,
    lgpdPending: stats.lgpd_pending ?? null,
    seriesTotalCumulative12w: series.series_total_cumulative_12w,
    seriesNovosDaily30: series.series_novos_daily_30,
    seriesEmpresasCumulative12w: series.series_empresas_cumulative_12w,
    seriesFornecedoresWeekly12: series.series_fornecedores_weekly_12,
  };
}

/**
 * Contagem exata de contatos numa janela `[fromDays, toDays)` de idade, com o MESMO recorte
 * de `fetchKpiRows` (soft-delete + legado) e a visibilidade do RLS. `head: true` traz só o
 * `count`, sem corpo.
 */
async function countContactsWindow(
  includeLegacy: boolean,
  fromDays: number,
  toDays: number,
  contactType?: string,
): Promise<number> {
  const now = Date.now();
  let q = supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .gte('created_at', new Date(now - toDays * DAY).toISOString())
    .lt('created_at', new Date(now - fromDays * DAY).toISOString());
  if (contactType) q = q.eq('contact_type', contactType);
  if (!includeLegacy) {
    q = q.eq('is_lid_legacy', false).filter('phone', 'match', CONTACT_VISIBLE_PHONE_PATTERN);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/**
 * `types.ts` é gerado a partir do banco e ainda não traz `contacts_stats_series`
 * (contrato entregue no cartão t_6fc22a23). Enquanto o gerador não roda, a chamada
 * sai por este adaptador local, com o mesmo jsonb documentado no db-audit do pai.
 */
function rpcStatsSeries(includeLegacy: boolean) {
  const call = supabase.rpc as unknown as (
    fn: 'contacts_stats_series',
    args: { p_include_legacy: boolean },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  return call('contacts_stats_series', { p_include_legacy: includeLegacy });
}

/**
 * Indicadores de Contatos (CT-E/PB-30) em 2 RPCs agregadas + 3 contagens exatas — em vez de
 * paginar a tabela `contacts` inteira no navegador (`fetchKpiRows`, 1000 linhas por resposta).
 */
export async function fetchContactsKpi(includeLegacy: boolean): Promise<ContactsKpi> {
  const [statsRes, seriesRes, novosPrev30, fornecedores30, fornecedoresPrev30] = await Promise.all([
    supabase.rpc('contacts_stats', { p_include_legacy: includeLegacy }),
    rpcStatsSeries(includeLegacy),
    countContactsWindow(includeLegacy, 30, 60),
    countContactsWindow(includeLegacy, 0, 30, 'fornecedor'),
    countContactsWindow(includeLegacy, 30, 60, 'fornecedor'),
  ]);
  if (statsRes.error) throw statsRes.error;
  if (seriesRes.error) throw seriesRes.error;
  return kpiFromServer(
    (statsRes.data ?? {}) as unknown as ContactsStats,
    (seriesRes.data ?? {}) as unknown as ContactsStatsSeries,
    { novosPrev30, fornecedores30, fornecedoresPrev30 },
  );
}

export function useContactsKpi(includeLegacy: boolean) {
  return useQuery({
    queryKey: ['contacts-kpi', includeLegacy],
    queryFn: () => fetchContactsKpi(includeLegacy),
    staleTime: 60_000,
    ...CONTACTS_AGGREGATE_QUERY_OPTIONS,
  });
}
