/**
 * useSearchInsights
 *
 * HZ1-06: números da busca global para a tela de admin "Insights de Busca".
 * Faz UMA consulta à RPC canônica `search_insights(p_days)` (migration
 * 20261016013134) e normaliza a linha retornada para a tela.
 *
 * Sem PII: `search_events` não persiste os termos buscados — a RPC só devolve
 * agregados (contagens, tamanho médio do termo e cliques por tipo). Não há como
 * listar termos mais buscados nem termos sem resultado.
 * Visibilidade: quem barra é a própria RPC — ela nega quem não é admin/supervisor
 * (42501). O hook não acrescenta nem contorna recorte de papel.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SearchInsightsPeriod = 7 | 30 | 90;

export const SEARCH_INSIGHTS_PERIODS: readonly SearchInsightsPeriod[] = [7, 30, 90];
export const DEFAULT_SEARCH_INSIGHTS_PERIOD: SearchInsightsPeriod = 30;

export interface SearchInsights {
  /** Janela (em dias) que a RPC aplicou na agregação. */
  days: number;
  total: number;
  noResults: number;
  clicks: number;
  /** Fração 0..1 — quantas buscas geraram clique. */
  clickRate: number;
  /** Média de caracteres do termo buscado (o termo em si não é armazenado). */
  averageTermLength: number;
  /** Cliques por tipo de resultado (`message`, `contact`, …). */
  searchesByKind: Record<string, number>;
}

export const searchInsightsQueryKey = (days: number) => ['search-insights', days] as const;

export class SearchInsightsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchInsightsError';
  }
}

/**
 * Contagem inteira não negativa. Valor ausente ou de tipo inesperado NÃO vira
 * zero silencioso: um KPI errado na tela de admin é pior que um erro visível.
 */
function toCount(value: unknown, field: string): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new SearchInsightsError(`Resposta inválida da RPC search_insights (${field}).`);
  }
  return parsed;
}

function toAverage(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new SearchInsightsError('Resposta inválida da RPC search_insights (average_term_length).');
  }
  return parsed;
}

/** Normaliza a linha agregada da RPC canônica (aceita a linha ou o array dela). */
export function parseSearchInsights(raw: unknown, days: number): SearchInsights {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new SearchInsightsError('Resposta vazia ou inválida da RPC search_insights.');
  }
  const data = row as Record<string, unknown>;
  const total = toCount(data.total_searches, 'total_searches');
  const noResults = toCount(data.searches_without_results, 'searches_without_results');
  const clicks = toCount(data.searches_with_click, 'searches_with_click');
  if (noResults > total || clicks > total) {
    throw new SearchInsightsError('Contagens inconsistentes na resposta da RPC search_insights.');
  }

  const rawKinds = data.searches_by_kind;
  if (rawKinds !== undefined && rawKinds !== null && (typeof rawKinds !== 'object' || Array.isArray(rawKinds))) {
    throw new SearchInsightsError('Resposta inválida da RPC search_insights (searches_by_kind).');
  }
  const searchesByKind: Record<string, number> = {};
  for (const [kind, value] of Object.entries((rawKinds ?? {}) as Record<string, unknown>)) {
    if (kind.trim()) searchesByKind[kind] = toCount(value, `searches_by_kind.${kind}`);
  }

  return {
    days,
    total,
    noResults,
    clicks,
    clickRate: total > 0 ? clicks / total : 0,
    averageTermLength: toAverage(data.average_term_length ?? 0),
    searchesByKind,
  };
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
