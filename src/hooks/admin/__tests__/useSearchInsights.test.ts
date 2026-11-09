import { describe, expect, it } from 'vitest';
import { parseSearchInsights } from '../useSearchInsights';

describe('parseSearchInsights', () => {
  it('mapeia o contrato canônico e calcula a taxa de cliques', () => {
    expect(
      parseSearchInsights(
        {
          total_searches: 20,
          searches_without_results: 4,
          searches_with_click: 5,
          average_term_length: 8.5,
          searches_by_kind: { contacts: 12 },
        },
        30,
      ),
    ).toEqual({
      days: 30,
      total: 20,
      noResults: 4,
      clicks: 5,
      clickRate: 0.25,
      topQueries: [],
      noResultTerms: [],
    });
  });

  it('normaliza linha ausente sem inventar termos ou dividir por zero', () => {
    expect(parseSearchInsights(undefined, 7)).toEqual({
      days: 7,
      total: 0,
      noResults: 0,
      clicks: 0,
      clickRate: 0,
      topQueries: [],
      noResultTerms: [],
    });
  });
});
