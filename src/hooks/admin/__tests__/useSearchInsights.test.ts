import { describe, expect, it } from 'vitest';
import { parseSearchInsights, SearchInsightsError } from '../useSearchInsights';

describe('parseSearchInsights', () => {
  it('mapeia o contrato canônico, a taxa de cliques e os dois campos antes descartados', () => {
    expect(
      parseSearchInsights(
        {
          total_searches: 20,
          searches_without_results: 4,
          searches_with_click: 5,
          average_term_length: 8.5,
          searches_by_kind: { contact: 3, message: 2 },
        },
        30,
      ),
    ).toEqual({
      days: 30,
      total: 20,
      noResults: 4,
      clicks: 5,
      clickRate: 0.25,
      averageTermLength: 8.5,
      searchesByKind: { contact: 3, message: 2 },
    });
  });

  it('aceita o array devolvido pela RPC e trata ausência de tipos sem inventar cliques', () => {
    expect(
      parseSearchInsights([{ total_searches: 0, searches_without_results: 0, searches_with_click: 0 }], 7),
    ).toEqual({
      days: 7,
      total: 0,
      noResults: 0,
      clicks: 0,
      clickRate: 0,
      averageTermLength: 0,
      searchesByKind: {},
    });
  });

  it('recusa linha ausente em vez de mostrar zero como se fosse medição', () => {
    expect(() => parseSearchInsights(undefined, 7)).toThrow(SearchInsightsError);
    expect(() => parseSearchInsights([], 7)).toThrow(/Resposta vazia ou inválida/);
  });

  it('recusa contagem inválida e contagem incoerente com o total', () => {
    expect(() => parseSearchInsights({ total_searches: 'x', searches_without_results: 0, searches_with_click: 0 }, 30))
      .toThrow(/total_searches/);
    expect(() => parseSearchInsights({ total_searches: 5, searches_without_results: 9, searches_with_click: 0 }, 30))
      .toThrow(/Contagens inconsistentes/);
    expect(() => parseSearchInsights({ total_searches: 5, searches_without_results: 0, searches_with_click: 9 }, 30))
      .toThrow(/Contagens inconsistentes/);
  });

  it('recusa searches_by_kind que não é objeto e valor de tipo inválido', () => {
    expect(() => parseSearchInsights(
      { total_searches: 1, searches_without_results: 0, searches_with_click: 1, searches_by_kind: [1, 2] },
      30,
    )).toThrow(/searches_by_kind/);
    expect(() => parseSearchInsights(
      { total_searches: 1, searches_without_results: 0, searches_with_click: 1, searches_by_kind: { contact: -1 } },
      30,
    )).toThrow(/searches_by_kind.contact/);
  });
});
