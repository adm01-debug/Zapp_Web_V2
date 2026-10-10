import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * X185 — fonte de dados do Analytics (tela 07) na RPC `talkx_overview_stats`.
 *
 * A tela 07 recalculava a taxa de resposta no navegador (janela de 24 h, só
 * `status='sent'`, teto de 5.000 linhas) e não tinha como recortar canal, origem
 * do público nem equipe. Aqui os filtros da barra viram argumentos da RPC e o
 * recorte inteiro (current/previous/daily/active) vem do servidor.
 *
 * A assinatura chamada é a de
 * `supabase/migrations/20261002631230_talkx_v4_x072_overview_stats.sql`:
 * `talkx_overview_stats(p_from, p_to, p_audience_source, p_department_id, p_channel, p_timezone)`.
 * Os quatro últimos são opcionais por DEFAULT; `p_timezone` fica de fora de propósito —
 * o padrão da RPC é America/Sao_Paulo, o mesmo do público desta tela.
 */

/** Filtros da barra do Analytics (X185). */
export interface TalkXAnalyticsFilters {
  /** Início do período (inclusive). Obrigatório. */
  from: Date;
  /** Fim do período (inclusive). Obrigatório. */
  to: Date;
  /** Origem do público: 'contacts' | 'segment' | 'crm360'. null = todas. */
  audienceSource?: string | null;
  /** Equipe (departamento). null = todas. */
  departmentId?: string | null;
  /** Canal. null = todos os canais. */
  channel?: string | null;
}

/** Um período de `current`/`previous` da RPC (mesmos campos nos dois). */
export interface TalkXAnalyticsTotals {
  campaigns_sent: number;
  completed: number;
  contacts_reached: number;
  sent: number;
  delivered: number;
  replied: number;
  failed: number;
  unknown: number;
  delivery_rate_pct: number;
  reply_rate_pct: number;
  active?: number;
  /**
   * Campos que a etapa X073 (banco) ainda acrescenta à RPC. Enquanto não vierem,
   * o valor é nulo e a tela mostra "sem dados ainda" — nunca zero fabricado.
   */
  read?: number | null;
  conversions?: number | null;
  revenue?: number | null;
  segment_conversion_rate_pct?: number | null;
}

/** Um ponto da série diária (`daily` da RPC, com zero-fill no servidor). */
export interface TalkXAnalyticsDay {
  day: string;
  sent: number;
  delivered: number;
  replied: number;
}

export interface TalkXAnalyticsStats {
  period?: { from: string; to: string; timezone?: string };
  current: TalkXAnalyticsTotals;
  previous: TalkXAnalyticsTotals | null;
  active: number;
  daily: TalkXAnalyticsDay[];
}

/**
 * Cadência de atualização com campanha em `sending` (X185). Sem campanha
 * enviando nada muda sozinho, então o polling fica desligado.
 */
export const ANALYTICS_REFETCH_MS = 60_000;

/** 'all' (e vazio) significa "sem recorte" → argumento nulo na RPC. */
function recorte(valor: string | null | undefined): string | undefined {
  if (!valor || valor === 'all') return undefined;
  return valor;
}

/**
 * Consulta o resumo do período com os filtros da barra.
 *
 * `live` liga a reconsulta de 60 s — quem chama decide, olhando a lista de
 * campanhas (`status === 'sending'`). Sem isso, nenhum polling.
 */
export function useTalkXAnalytics(
  filters: TalkXAnalyticsFilters,
  opts: { live?: boolean; enabled?: boolean } = {},
) {
  const from = filters.from.toISOString();
  const to = filters.to.toISOString();
  const audienceSource = recorte(filters.audienceSource);
  const departmentId = recorte(filters.departmentId);
  const channel = recorte(filters.channel);
  const live = opts.live === true;

  return useQuery({
    queryKey: ['talkx-analytics', from, to, audienceSource ?? null, departmentId ?? null, channel ?? null],
    queryFn: async (): Promise<TalkXAnalyticsStats> => {
      const { data, error } = await supabase.rpc('talkx_overview_stats', {
        p_from: from,
        p_to: to,
        p_audience_source: audienceSource,
        p_department_id: departmentId,
        p_channel: channel,
      });
      if (error) throw new Error('talkx-analytics: falha ao consultar talkx_overview_stats');
      return data as unknown as TalkXAnalyticsStats;
    },
    enabled: opts.enabled !== false,
    // 60 s SÓ com campanha em `sending`.
    refetchInterval: live ? ANALYTICS_REFETCH_MS : false,
    staleTime: 30_000,
  });
}

/**
 * Variação percentual entre dois períodos, no formato que a tela mostra
 * ("+50%"). Sem período anterior (ou base zero) não há variação para exibir.
 */
export function variacaoPct(
  atual: number | null | undefined,
  anterior: number | null | undefined,
): string | null {
  if (atual == null || anterior == null || anterior <= 0) return null;
  const delta = ((atual - anterior) / anterior) * 100;
  const sinal = delta >= 0 ? '+' : '-';
  return `${sinal}${Math.round(Math.abs(delta))}%`;
}

/** Diferença em pontos percentuais (taxas), no formato "+1,2 p.p.". */
export function variacaoPontos(
  atual: number | null | undefined,
  anterior: number | null | undefined,
): string | null {
  if (atual == null || anterior == null) return null;
  const delta = atual - anterior;
  const sinal = delta >= 0 ? '+' : '-';
  return `${sinal}${Math.abs(delta).toFixed(1).replace('.', ',')} p.p.`;
}
