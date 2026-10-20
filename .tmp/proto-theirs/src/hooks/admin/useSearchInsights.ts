/**
 * useSearchInsights
 *
 * HZ1-06: números da busca global para a tela de admin "Insights de Busca".
 * Faz UMA consulta à RPC `get_search_insights(p_days)` (migration
 * 20261016112552, trilha irmã) e normaliza o jsonb para a tela.
 *
 * Sem PII: a RPC lê apenas `search_events.term_normalized` (nada de contato,
 * telefone ou conteúdo de conversa).
 * Visibilidade: quem barra é a própria RPC — ela nega quem não é admin/supervisor
 * (42501). O hook não acrescenta nem contorna recorte de papel.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SearchInsightsPeriod = 7 | 30 | 90;

export const SEARCH_INSIGHTS_PERIODS: readonly SearchInsightsPeriod[] = [7, 30, 90];
export const DEFAULT_SEARCH_INSIGHTS_PERIOD: SearchInsightsPeriod = 30;

/** Linha das tabelas de topo. `count` é quantas buscas usaram o termo. */
export interface SearchInsightTerm {
  term: string;
  count: number;
}

export interface SearchInsights {
  /** Janela (em dias) que a RPC aplicou na agregação. */
  days: number;
  total: number;
  noResults: number;
  clicks: number;
  /** Fração 0..1 — quantas buscas geraram clique. */
  clickRate: number;
  topQueries: SearchInsightTerm[];
  noResultTerms: SearchInsightTerm[];
}

export const searchInsightsQueryKey = (days: number) => ['search-insights', days] as const;

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toTerms(value: unknown): SearchInsightTerm[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const { term, count } = row as { term?: unknown; count?: unknown };
    if (typeof term !== 'string' || term.length === 0) return [];
    return [{ term, count: toCount(count) }];
  });
}

/** Normaliza o jsonb da RPC: campo ausente ou de tipo inesperado vira 0/[] em vez de quebrar a tela. */
export function parseSearchInsights(raw: unknown): SearchInsights {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const clickRate = typeof data.click_rate === 'number' && Number.isFinite(data.click_rate)
    ? data.click_rate
    : 0;

  return {
    days: toCount(data.days),
    total: toCount(data.total),
    noResults: toCount(data.no_results),
    clicks: toCount(data.clicks),
    clickRate,
    topQueries: toTerms(data.top_queries),
    noResultTerms: toTerms(data.no_result_terms),
  };
}

export class SearchInsightsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchInsightsError';
  }
}

async function fetchSearchInsights(days: number): Promise<SearchInsights> {
  // A RPC nasce na migration irmã 20261016112552 (HZ1-06) e ainda não está no
  // types.ts gerado. O contrato fica replicado aqui até o artefato ser
  // ressincronizado — então esta ponte vira um `supabase.rpc('get_search_insights', …)`.
  const rpc = supabase.rpc as unknown as (
    fn: 'get_search_insights',
    args: { p_days: number },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await rpc('get_search_insights', { p_days: days });
  if (error) throw new SearchInsightsError(error.message);
  return parseSearchInsights(data);
}

export function useSearchInsights(days: SearchInsightsPeriod = DEFAULT_SEARCH_INSIGHTS_PERIOD) {
  return useQuery({
    queryKey: searchInsightsQueryKey(days),
    queryFn: () => fetchSearchInsights(days),
    staleTime: 60_000,
  });
}
