import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// As funções são introduzidas pela migration da etapa X086. O types-sync gera a
// assinatura canônica só depois que o banco canônico receber a migration; não
// editar `types.ts` à mão, para não mascarar drift entre código e banco.
type PendingDatabaseRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/**
 * X091 — KPIs de template ligados às RPCs de métricas (X086).
 *
 * As definições são as da trilha de templates (F08): enviados = destinatários com
 * `sent_at`; taxa de resposta = quem tem `replied_at` ÷ enviados do período; taxa de
 * conversão = conversões do template no período ÷ enviados; taxa de rejeição = opt-outs
 * com `campaign_id` de campanha do template ÷ enviados (falha de envio não é rejeição).
 * A variação (A9) só aparece com pelo menos `TALKX_STATS_MIN_BASE` enviados nos DOIS
 * períodos — abaixo disso não há base para comparar.
 *
 * Contrato consumido (definido no plano V4, X086):
 *   talkx_template_library_stats(p_days, p_top) → TalkXTemplateLibraryStats
 *   talkx_template_stats(p_template_id, p_from, p_to) → TalkXTemplateStats
 * A RPC só devolve agregados (sem PII) e é SECURITY DEFINER com EXECUTE para
 * `authenticated`.
 */

/** Base mínima de enviados (decisão A9) para existir variação/ranking. */
export const TALKX_STATS_MIN_BASE = 50;

/** Períodos oferecidos pelo seletor do card "Desempenho deste template". */
export const TALKX_TEMPLATE_STATS_PERIODS = [7, 30, 90] as const;

export interface TalkXTemplatePeriodStats {
  sent: number | null;
  replied: number | null;
  converted: number | null;
  opted_out: number | null;
  reply_rate_pct: number | null;
  conversion_rate_pct: number | null;
  rejection_rate_pct: number | null;
}

export interface TalkXTemplateStats extends TalkXTemplatePeriodStats {
  /** Mesmos números do período anterior de igual duração. */
  previous: TalkXTemplatePeriodStats | null;
}

export interface TalkXTemplateLibraryStats {
  total: number | null;
  created_current_month: number | null;
  created_previous_month: number | null;
  /** Série de criação (8 pontos) para o sparkline do "Total de templates". */
  created_series: number[] | null;
  approved: number | null;
  approved_period: number | null;
  approved_previous_period: number | null;
  approved_series: number[] | null;
  /** Mais usado por MENSAGENS enviadas (não por `use_count`, que conta campanhas). */
  most_used: { name: string | null; messages: number | null; series: number[] | null } | null;
  with_media: number | null;
  with_media_series: number[] | null;
  avg_reply_rate_pct: number | null;
  avg_reply_rate_previous_pct: number | null;
  /** Enviados que formam a base das duas taxas médias acima. */
  reply_base_current: number | null;
  reply_base_previous: number | null;
  best_reply: { name: string | null; version: number | null; reply_rate_pct: number | null } | null;
}

/** Intervalo dos últimos `dias` (default 30), em ISO, para `p_from`/`p_to`. */
export function templateStatsRange(dias: number, now: Date = new Date()): { p_from: string; p_to: string } {
  const days = Math.max(1, Math.trunc(dias) || 1);
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { p_from: from.toISOString(), p_to: new Date(now).toISOString() };
}

/**
 * Variação em pontos percentuais entre dois períodos. Nula quando falta um dos
 * lados (o RPC devolve nulo sem base) ou quando a base de enviados é menor que o
 * mínimo de A9 — nesse caso a tela não mostra seta nenhuma.
 */
export function pointsDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  baseCurrent: number | null | undefined,
  basePrevious: number | null | undefined,
  minBase: number = TALKX_STATS_MIN_BASE,
): number | null {
  if (current == null || previous == null) return null;
  if ((baseCurrent ?? 0) < minBase || (basePrevious ?? 0) < minBase) return null;
  return current - previous;
}

/** KPIs da biblioteca (telas 04 e 05) — total, aprovados, mais usados e taxa média. */
export function useTalkXTemplateLibraryStats(dias: number = 30, top: number = 3) {
  const query = useQuery({
    queryKey: ['talkx-template-library-stats', dias, top],
    queryFn: async () => {
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('talkx_template_library_stats', { p_days: dias, p_top: top });
      if (error) throw error;
      return (data ?? null) as TalkXTemplateLibraryStats | null;
    },
  });
  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Desempenho do template ativo em `dias` — enviados, resposta, conversão e rejeição,
 * com o período anterior de igual duração. Sem template (modo "novo template") a
 * consulta não roda.
 */
export function useTalkXTemplateStats(templateId: string | null | undefined, dias: number = 30) {
  const query = useQuery({
    queryKey: ['talkx-template-stats', templateId ?? '', dias],
    enabled: !!templateId,
    queryFn: async () => {
      const { p_from, p_to } = templateStatsRange(dias);
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('talkx_template_stats', {
        p_template_id: templateId as string,
        p_from,
        p_to,
      });
      if (error) throw error;
      return (data ?? null) as TalkXTemplateStats | null;
    },
  });
  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
