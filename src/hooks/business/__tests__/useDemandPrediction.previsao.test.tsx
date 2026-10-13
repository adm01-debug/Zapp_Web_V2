/**
 * `useDemandPrediction` — como a série de previsão nasce do histórico de 7 dias
 * e quais números o painel usa.
 *
 * O sujeito é o hook REAL; a dublagem é só a leitura de `messages` no banco.
 * Com histórico plano (todas as horas iguais), a tendência devolvida é 'down'
 * porque a última previsão não supera o último real — é uma característica a
 * documentar, não um número inventado do gráfico.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; op: string; select?: string; filtros: unknown[][] }>,
  resposta: { rows: [] as Array<{ created_at: string }>, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const reg: { table: string; op: string; select?: string; filtros: unknown[][] } = {
        table,
        op: 'select',
        filtros: [],
      };
      h.ops.push(reg);
      const b: Record<string, unknown> = {};
      b.select = (s: string) => {
        reg.select = s;
        return b;
      };
      b.gte = (...a: unknown[]) => {
        reg.filtros.push(['gte', ...a]);
        return b;
      };
      b.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve({ data: h.resposta.rows, error: h.resposta.error }).then(ok, falhou);
      return b;
    },
  },
}));

import { useDemandPrediction } from '../useDemandPrediction';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** 7 dias × 24 horas, com a hora local de cada linha — cada hora some 7 msgs. */
function historicoPlano(): Array<{ created_at: string }> {
  const linhas: Array<{ created_at: string }> = [];
  for (let hora = 0; hora < 24; hora++) {
    for (let dia = 1; dia <= 7; dia++) {
      const d = new Date();
      d.setDate(d.getDate() - dia);
      d.setHours(hora, 0, 0, 0);
      linhas.push({ created_at: d.toISOString() });
    }
  }
  return linhas;
}

beforeEach(() => {
  h.ops.length = 0;
  h.resposta = { rows: historicoPlano(), error: null };
});

describe('useDemandPrediction — série gerada do histórico', () => {
  it('lê messages só dos últimos 7 dias, em páginas de created_at', async () => {
    const { result } = renderHook(() => useDemandPrediction(undefined, 35), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(9));

    const leitura = h.ops.find((o) => o.table === 'messages');
    expect(leitura?.select).toBe('created_at');
    const gte = leitura?.filtros.find((f) => f[0] === 'gte');
    expect(gte?.[1]).toBe('created_at');
    const desde = Date.parse(String(gte?.[2]));
    expect(Math.abs(Date.now() - 7 * 24 * 60 * 60 * 1000 - desde)).toBeLessThan(60_000);
  });

  it('devolve 5 pontos reais + 4 previstos, com a média por hora do histórico', async () => {
    const { result } = renderHook(() => useDemandPrediction(undefined, 100), { wrapper });
    // espera a leitura chegar (o fallback de histórico vazio também tem 9 pontos)
    await waitFor(() => expect(result.current.insights.currentActual).toBe(1));

    const serie = result.current.data;
    // 7 msgs na hora / 7 dias = 1 por hora
    expect(serie.slice(0, 5).map((p) => [p.isPrediction, p.actual])).toEqual([
      [false, 1],
      [false, 1],
      [false, 1],
      [false, 1],
      [false, 1],
    ]);
    expect(serie.slice(5).every((p) => p.isPrediction === true)).toBe(true);
    expect(serie.slice(5).map((p) => p.predicted)).toEqual([1, 1, 1, 1]);
    // faixa = max(2, 20% de 1) + horizonte (1..4) -> 4, 5, 6, 7
    expect(serie.slice(5).map((p) => p.upper)).toEqual([4, 5, 6, 7]);
    expect(serie.slice(5).map((p) => p.lower)).toEqual([0, 0, 0, 0]);
  });

  it('resume o pico, a média e a tendência do que acabou de prever', async () => {
    const { result } = renderHook(() => useDemandPrediction(undefined, 100), { wrapper });
    await waitFor(() => expect(result.current.insights.currentActual).toBe(1));

    const { insights } = result.current;
    expect(insights.maxPredicted).toBe(1);
    expect(insights.avgPredicted).toBe(1);
    expect(insights.currentActual).toBe(1);
    expect(insights.capacityRisk).toBe(false);
    // histórico plano: a última previsão empata com o último real -> não é alta
    expect(insights.trend).toBe('down');
    expect(insights.peakTime).not.toBe('');
  });

  it('capacidade é risco só quando o pico passa dela', async () => {
    const semFolga = renderHook(() => useDemandPrediction(undefined, 0), { wrapper });
    await waitFor(() => expect(semFolga.result.current.insights.maxPredicted).toBe(1));
    expect(semFolga.result.current.insights.capacityRisk).toBe(true);

    const comFolga = renderHook(() => useDemandPrediction(undefined, 1), { wrapper });
    await waitFor(() => expect(comFolga.result.current.insights.maxPredicted).toBe(1));
    expect(comFolga.result.current.insights.capacityRisk).toBe(false);
  });
});

describe('useDemandPrediction — dado externo', () => {
  it('quando a tela passa a série, ela é usada como está', async () => {
    const externa = [
      { time: '10:00', actual: 3, predicted: 3, lower: 3, upper: 3, isPrediction: false },
      { time: '11:00', predicted: 9, lower: 7, upper: 11, isPrediction: true },
    ];

    const { result } = renderHook(() => useDemandPrediction(externa, 5), { wrapper });
    await waitFor(() => expect(result.current.insights.maxPredicted).toBe(9));

    expect(result.current.data).toBe(externa);
    expect(result.current.insights.trend).toBe('up');
    expect(result.current.insights.capacityRisk).toBe(true);
  });
});
