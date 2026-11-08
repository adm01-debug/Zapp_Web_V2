/**
 * useSearchInsights
 *
 * HZ1-06: números da busca global para a tela de admin "Insights de Busca".
 * Faz UMA consulta à RPC canônica `search_insights(p_days)` (migration
 * 20261016013134) e normaliza a linha retornada para a tela.
 *
 * Sem PII: `search_events` não persiste os termos buscados. Por isso as listas
 * de termos ficam vazias; somente métricas agregadas são exibidas.
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

/** Normaliza a linha agregada da RPC canônica. */
export function parseSearchInsights(raw: unknown, days: number): SearchInsights {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const total = toCount(row.total_searches);
  const clicks = toCount(row.searches_with_click);

  return {
    days,
    total,
    noResults: toCount(row.searches_without_results),
    clicks,
    clickRate: total > 0 ? clicks / total : 0,
    // O schema canônico preserva privacidade e não armazena termos.
    topQueries: [],
    noResultTerms: [],
  };
}

export class SearchInsightsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchInsightsError';
  }
}

async function fetchSearchInsights(days: number): Promise<SearchInsights> {
  const { data, error } = await supabase.rpc('search_insights', { p_days: days });
  if (error) throw new SearchInsightsError(error.message);
  return parseSearchInsights(data?.[0], days);
}

export function useSearchInsights(days: SearchInsightsPeriod = DEFAULT_SEARCH_INSIGHTS_PERIOD) {
  return useQuery({
    queryKey: searchInsightsQueryKey(days),
    queryFn: () => fetchSearchInsights(days),
    staleTime: 60_000,
  });
}
