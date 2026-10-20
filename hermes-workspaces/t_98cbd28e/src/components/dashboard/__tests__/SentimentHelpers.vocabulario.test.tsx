import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * IA-SENTIMENT-001 — a série do Dashboard (useRealSentimentData, que alimenta o
 * card e o gráfico de tendência) lia o sentimento CRU: só pt-BR entrava e o
 * `else` final transformava crítico E desconhecido em 'neutro'.
 *
 * Prova: o mesmo conjunto com pt-BR, legado EN, crítico, desconhecido e ausente
 * produz os mesmos totais do agregado e nada cai em 'neutro'.
 */

let linhas: unknown[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const construtor = (resolver: () => unknown) => {
    const b: Record<string, unknown> = {};
    for (const metodo of ['select', 'gte', 'lt', 'lte', 'not', 'eq', 'order', 'limit']) {
      b[metodo] = () => b;
    }
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve().then(resolver).then(res, rej);
    return b;
  };
  return { supabase: { from: () => construtor(() => ({ data: linhas, error: null })) } };
});

import { useRealSentimentData } from '../SentimentHelpers';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );

const criadoAgora = (min = 1) => new Date(Date.now() - min * 60_000).toISOString();
const analise = (sentiment: unknown) => ({ sentiment, sentiment_score: null, created_at: criadoAgora() });

describe('useRealSentimentData — série no vocabulário canônico (IA-SENTIMENT-001)', () => {
  beforeEach(() => {
    linhas = [
      analise('positivo'),
      analise('negative'),
      analise('neutral'),
      analise('critico'),
      analise('very_positive'),
      analise(null),
    ];
  });

  it('traduz o legado EN, soma o crítico ao negativo e não joga crítico/desconhecido em neutro', async () => {
    const { result } = renderHook(() => useRealSentimentData(7), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());

    const serie = result.current!;
    expect(serie).toHaveLength(1);
    // 6 análises no dia: 1 positivo, 2 negativos (legado + crítico), 1 neutro.
    // As percentagens usam o total real do dia, então 17/33/17 — o desconhecido
    // não é somado a 'neutro'.
    const dia = serie[0];
    expect({ positivo: dia.positive, negativo: dia.negative, neutro: dia.neutral }).toEqual({
      positivo: 17,
      negativo: 33,
      neutro: 17,
    });
    expect(dia.alerts_count).toBe(2);
  });
});
