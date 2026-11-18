/**
 * useSearchInsights
 *
 * HZ1-06: números da busca global para a tela de admin "Insights de Busca".
 * Faz UMA consulta à RPC `search_insights(p_days)` e normaliza a linha
 * retornada para a tela.
 *
 * Sem PII: a RPC lê apenas contadores agregados de `search_events`; o texto
 * da busca nunca é armazenado (privacidade por design da migration 20261016013134,
 * que cria a tabela com `term_length` mas sem coluna de texto).
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

/** Normaliza a linha de TABLE retornada pela RPC (array de um elemento) para a tela. */
export function parseSearchInsights(raw: unknown, days: number): SearchInsights {
  // RPC usa RETURNS TABLE → Supabase entrega [{…}]; extraímos a única linha.
  const row = Array.isArray(raw) && raw.length > 0 ? raw[0] : raw;
  const data = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;

  const total = toCount(data.total_searches);
  const clicks = toCount(data.searches_with_click);
  const clickRate = total > 0 ? clicks / total : 0;

  return {
    days,
    total,
    noResults: toCount(data.searches_without_results),
    clicks,
    clickRate,
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
  return parseSearchInsights(data, days);
}

export function useSearchInsights(days: SearchInsightsPeriod = DEFAULT_SEARCH_INSIGHTS_PERIOD) {
  return useQuery({
    queryKey: searchInsightsQueryKey(days),
    queryFn: () => fetchSearchInsights(days),
    staleTime: 60_000,
  });
}
