import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Amostra mínima por dia p/ mostrar "% vs período anterior" (E19) — abaixo disso, 1 outlier
 * já produz deltas fantasmas tipo "-100%" (achado A10). Sem delta é mais honesto
 * que delta errado. */
const MIN_SAMPLE_FOR_DELTA = 5;

/** Shape devolvido pela RPC dashboard_kpi (E23): contagens, mediana/p90 (via
 * percentile_cont) e buckets de 3h já agregados no servidor — substitui os 2
 * fetches crus (conversation_closures/conversation_sla) + agregação client-side
 * que existiam antes do E23.
 *
 * Até 13/10/2026 a RPC fixava as janelas em hoje/ontem (E34): `resolvedToday` e
 * `resolvedYesterday` eram sempre o dia atual e o anterior. A partir de
 * dashboard_kpi(p_since, p_queue, p_agent) (E31/E34, período escolhido),
 * os campos deixam de ser "hoje/ontem" e passam a ser o PERÍODO pedido e o
 * período ANTERIOR de MESMO TAMANHO encostado nele — os nomes do contrato foram
 * mantidos para não quebrar os consumidores.
 *
 * Nota: a assinatura nova dashboard_kpi(p_from, p_until, p_queue, p_agent) honra o
 * fim da janela. Enquanto a migration 20261026210000 não for aplicada, o hook cai
 * na antiga (só p_since) e a janela de fim não chega ao banco. */
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

/** Filtros do topo (E31) propagados como p_queue/p_agent, mais o período
 * escolhido (E34). `from` vira p_since no banco; `until` entra só na queryKey
 * (dashboard_kpi não aceita p_until ainda — P2 pendente).
 *
 * - `from`/`until`: janela [from, until). `until` nulo = janela aberta.
 *   Sem `from`, a RPC usa o dia atual em America/Sao_Paulo ("hoje").
 * - Para não-staff, dashboard_kpi trava p_agent = auth.uid() no servidor (E33),
 *   então passar outro agentId aqui não vaza dado de terceiro mesmo se o front
 *   tiver algum bug de visibilidade do filtro. */
export interface DashboardKpiFilters {
  queueId?: string | null;
  agentId?: string | null;
  from?: Date | null;
  until?: Date | null;
}

function pct(cur: number, prev: number): number | null {
  return prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
}

/** Só aplica o guard de amostra mínima (E19) sobre o que a RPC já agregou — o
 * período, o período anterior, a mediana e o p90 são calculados no banco
 * (dashboard_kpi, SECURITY INVOKER). Mantém o mesmo shape de saída de antes do
 * E23 — DashboardKpiRow.tsx não precisa mudar. `resolvedYesterday` e
 * `answeredYesterdayCount` vêm da RPC como o período anterior de MESMO TAMANHO
 * do período pedido, não mais como o dia de ontem. */
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

type RpcErro = { code?: string; message?: string };
type RpcResposta = { data: unknown; error: RpcErro | null };

/** `types.ts` só conhece a assinatura antiga (p_since); a nova entra por este cast estreito
 * até o `types-sync` regenerar o arquivo depois do apply da migration. Mantém o `this`. */
function chamarDashboardKpi(args: Record<string, unknown>): PromiseLike<RpcResposta> {
  return (supabase as unknown as {
    rpc: (fn: string, a: Record<string, unknown>) => PromiseLike<RpcResposta>;
  }).rpc('dashboard_kpi', args);
}

/** PGRST202 = função com esses argumentos não existe no schema cache; 42883 = undefined_function. */
function assinaturaNovaAusente(erro: RpcErro): boolean {
  return erro.code === 'PGRST202' || erro.code === '42883' || /Could not find the function/i.test(erro.message ?? '');
}

export function useDashboardKpi(filters: DashboardKpiFilters = {}) {
  const { queueId = null, agentId = null, from = null, until = null } = filters;
  // ISO uma vez: o mesmo valor entra na queryKey e no payload, então trocar o
  // período do filtro invalida o cache E chega ao servidor sem divergência.
  const fromIso = from ? from.toISOString() : null;
  const untilIso = until ? until.toISOString() : null;
  return useQuery({
    // E31/E34: período, fila e agente entram na queryKey — trocar o filtro do
    // topo tem que invalidar o cache do KPI (antes o dropdown era cosmético p/
    // este card, A9, e o período era ignorado, E34).
    queryKey: ['dashboard-kpi', fromIso, untilIso, queueId, agentId],
    queryFn: async () => {
      // Assinatura nova (E34): o período chega inteiro ao banco. Se a migration
      // 20261026210000 ainda não foi aplicada, o PostgREST responde PGRST202 e o
      // hook cai na assinatura antiga (só p_since), sem quebrar o card.
      const novo = await chamarDashboardKpi({
        p_from: fromIso,
        p_until: untilIso,
        p_queue: queueId,
        p_agent: agentId,
      });
      if (!novo.error) return aggregateDashboardKpi(novo.data as DashboardKpiRpcResult);
      if (!assinaturaNovaAusente(novo.error)) throw novo.error;

      const antigo = await chamarDashboardKpi({
        p_since: fromIso ?? undefined,
        p_queue: queueId ?? undefined,
        p_agent: agentId ?? undefined,
      });
      if (antigo.error) throw antigo.error;
      return aggregateDashboardKpi(antigo.data as DashboardKpiRpcResult);
    },
    staleTime: 60_000,
  });
}
