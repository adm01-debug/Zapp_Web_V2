import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * P1-D (doc 16) — tendência de sentimento.
 *
 * O card/gráfico mostrava "N de M conversas" a partir de uma consulta com
 * `.limit(400)` (amostra, não o período) e "vs. período anterior" comparando as
 * duas METADES do mesmo período. Aqui se prova o hook: percentual/score
 * PONDERADOS pelo total real de conversas, período ANTERIOR de mesmo tamanho,
 * leitura sem corte (paginada) e erro diferente de vazio.
 */

interface Linha { id: string; created_at: string; sentiment: string | null; department: string | null }

let linhas: Linha[] = [];
let erro: { message: string } | null = null;

vi.mock('@/integrations/supabase/client', () => {
  // Construtor de query PostgREST: encadeia, guarda os filtros de data e pagina
  // sobre o fixture com `.range(from, to)` — como o PostgREST de verdade faria.
  const construtor = () => {
    let gteV: string | null = null;
    let ltV: string | null = null;
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.gte = (_col: string, v: string) => { gteV = v; return b; };
    b.lt = (_col: string, v: string) => { ltV = v; return b; };
    b.order = () => b;
    b.range = (from: number, to: number) => {
      if (erro) return Promise.resolve({ data: null, error: erro });
      const sel = linhas
        .filter((r) => (!gteV || r.created_at >= gteV) && (!ltV || r.created_at < ltV))
        .sort((a, c) => (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
      return Promise.resolve({ data: sel.slice(from, to + 1), error: null });
    };
    return b;
  };
  return { supabase: { from: () => construtor() } };
});

import { useSentimentTrend } from '../useSentimentTrend';
import { appDayStart } from '@/lib/localDay';

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

/** Data no fuso do app, `daysAgo` dias atrás, às `hora` (determinística). */
const emDia = (daysAgo: number, hora: number) =>
  new Date(appDayStart(daysAgo).getTime() + hora * 3_600_000).toISOString();

const linha = (id: string, sentiment: string | null, daysAgo: number): Linha =>
  ({ id, created_at: emDia(daysAgo, 10), sentiment, department: null });

describe('useSentimentTrend', () => {
  beforeEach(() => {
    linhas = [];
    erro = null;
  });

  it('pondera percentual e score pelo total real (não média de médias diárias)', async () => {
    linhas = [
      // Dia -3: 1 positivo, 1 crítico (negativo) e 1 desconhecido (no total, sem balde).
      linha('d3a', 'positivo', 3),
      linha('d3b', 'critico', 3),
      linha('d3c', null, 3),
      // Dia -1: 1 positivo e 8 negativos (dia com volume bem maior).
      linha('d1a', 'positivo', 1),
      ...Array.from({ length: 8 }, (_, i) => linha(`d1n${i}`, 'negativo', 1)),
    ];

    const { result } = renderHook(() => useSentimentTrend(7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const { current, series, isError, isEmpty } = result.current;
    expect(isError).toBe(false);
    expect(isEmpty).toBe(false);
    expect(series).toHaveLength(7);
    expect(current).toMatchObject({ total: 12, positives: 2, negatives: 9, neutrals: 0, unknowns: 1 });
    // Ponderado pelo total: 2/12 = 17% (a média ingênua das médias diárias daria 22%).
    expect(current.positivePct).toBe(17);
    expect(current.negativePct).toBe(75);
    expect(current.avgScore).toBeCloseTo(-7 / 12, 5);
    // Nada de desconhecido virando 'neutro'.
    expect(current.neutralPct).toBe(0);
  });

  it('compara com o período imediatamente anterior de mesmo tamanho', async () => {
    linhas = [
      // Janela anterior (dias -13..-7): 2 positivos.
      linha('p1', 'positivo', 8),
      linha('p2', 'positivo', 8),
      // Janela atual: 2 positivos, 9 negativos, 1 desconhecido.
      linha('d3a', 'positivo', 3),
      linha('d3b', 'critico', 3),
      linha('d3c', null, 3),
      linha('d1a', 'positivo', 1),
      ...Array.from({ length: 8 }, (_, i) => linha(`d1n${i}`, 'negativo', 1)),
    ];

    const { result } = renderHook(() => useSentimentTrend(7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const { previous, deltaPct, current } = result.current;
    expect(previous).toMatchObject({ total: 2, positives: 2, positivePct: 100 });
    expect(previous!.avgScore).toBeCloseTo(1, 5);
    // (-7/12 - 1) / |1| = -158%
    expect(deltaPct).toBe(Math.round(((current.avgScore - previous!.avgScore) / Math.abs(previous!.avgScore)) * 100));
    expect(deltaPct).toBe(-158);
  });

  it('sem análises no período anterior, não inventa base de comparação', async () => {
    linhas = [linha('a1', 'positivo', 1)];

    const { result } = renderHook(() => useSentimentTrend(7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.previous).toBeNull();
    expect(result.current.deltaPct).toBeNull();
  });

  it('distingue erro de vazio', async () => {
    erro = { message: 'permissão negada' };

    const { result } = renderHook(() => useSentimentTrend(7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isEmpty).toBe(false);

    erro = null;
    linhas = [];
    const vazio = renderHook(() => useSentimentTrend(7), { wrapper: wrapper() });
    await waitFor(() => expect(vazio.result.current.isLoading).toBe(false));
    expect(vazio.result.current.isError).toBe(false);
    expect(vazio.result.current.isEmpty).toBe(true);
    expect(vazio.result.current.current.total).toBe(0);
  });

  it('lê a janela inteira, sem corte em uma página (nem em 400 linhas)', async () => {
    linhas = Array.from({ length: 1200 }, (_, i) => linha(`x${String(i).padStart(4, '0')}`, 'positivo', 0));

    const { result } = renderHook(() => useSentimentTrend(7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.current.total).toBe(1200);
    expect(result.current.current.positives).toBe(1200);
  });
});
