import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { format } from 'date-fns';
import React from 'react';

/**
 * IA-SENTIMENT-001 + HZ2-003 — a contagem canônica (crítico = negativo, valor
 * desconhecido fora de todos os baldes) e o agrupamento por dia em
 * America/Sao_Paulo passaram a ser do SERVIDOR: a RPC `sentiment_trend`
 * (supabase/tests/sentiment_trend.sql prova a tradução do legado EN e o
 * crítico somado ao negativo rodando as migrations reais).
 *
 * Aqui o hook só tem o que ele ainda decide: transportar a contagem da RPC para
 * o shape do gráfico sem reinventar classe nem percentual, deixar o dia sem
 * análise fora da série e DEVOLVER o erro em vez de fingir "sem dados".
 */

let linhas: unknown[] = [];
let erro: unknown = null;
const chamadas: Array<{ nome: string; args: unknown }> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      chamadas.push({ nome, args });
      return Promise.resolve({ data: erro ? null : linhas, error: erro });
    },
  },
}));

import { useSentimentTrend, mapTrendRows, splitWindows, summarizeWindow, sentimentDeltaPct } from '@/hooks/dashboard/useSentimentTrend';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );

const dia = (menosDias: number) => format(new Date(Date.now() - menosDias * 86_400_000), 'yyyy-MM-dd');

const linha = (over: Record<string, unknown> = {}) => ({
  dia: dia(1),
  total: 6,
  positivos: 1,
  neutros: 1,
  negativos: 2,
  media: 40,
  indice: -0.1667,
  ...over,
});

describe('useSentimentTrend — série agregada no servidor (HZ2-003)', () => {
  beforeEach(() => {
    chamadas.length = 0;
    erro = null;
    linhas = [linha()];
  });

  it('pede a série à RPC `sentiment_trend` com o dobro do período (atual + anterior), sem select de linhas cruas', async () => {
    const { result } = renderHook(() => useSentimentTrend(14), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(chamadas).toEqual([{ nome: 'sentiment_trend', args: { p_days: 28 } }]);
  });

  it('transporta a contagem canônica da RPC sem reinventar percentual (crítico já é negativo)', async () => {
    linhas = [linha({ total: 6, positivos: 1, neutros: 1, negativos: 2 })];
    const { result } = renderHook(() => useSentimentTrend(7), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const serie = result.current.data!;
    expect(serie).toHaveLength(1);
    // As percentagens usam o total real do dia (6), então 17/17/33 — o
    // desconhecido não é somado a 'neutro' e o crítico já vem em `negativos`.
    expect({ positivo: serie[0].positive, neutro: serie[0].neutral, negativo: serie[0].negative })
      .toEqual({ positivo: 17, neutro: 17, negativo: 33 });
    expect(serie[0].alerts_count).toBe(2);
    // O `avg_score` do gráfico é a média REAL do dia (`media` 0..100 do
    // servidor) convertida para a escala [-1,1] que o gráfico devolve com
    // (avg_score + 1) * 50: 40 => -0.2 => 40 de volta.
    expect(serie[0].avg_score).toBeCloseTo(-0.2, 4);
    expect(Math.round((serie[0].avg_score + 1) * 50)).toBe(40);
  });

  it('a média real decide o `avg_score` — o saldo (pos − neg)/total não', async () => {
    // Dia otimista no saldo (indice 0.9) mas com média real baixa (30): o
    // gráfico mostra a média das notas, não o saldo.
    linhas = [linha({ total: 10, positivos: 9, negativos: 0, neutros: 1, media: 30, indice: 0.9 })];
    const { result } = renderHook(() => useSentimentTrend(7), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data![0].avg_score).toBeCloseTo(-0.4, 4);
    expect(Math.round((result.current.data![0].avg_score + 1) * 50)).toBe(30);
  });

  it('dia com análise e nenhuma nota usa o saldo do dia, sem inventar 50 (IA-023)', async () => {
    linhas = [linha({ total: 4, positivos: 3, negativos: 1, neutros: 0, media: null, indice: 0.5 })];
    const { result } = renderHook(() => useSentimentTrend(7), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data![0].avg_score).toBe(0.5);
    expect(result.current.data![0].avg_score).not.toBe(0);
  });

  it('a última data da série é HOJE (a janela termina no balde de hoje, sem corte de 1000 linhas)', async () => {
    linhas = [
      linha({ dia: dia(30), total: 1001 }),
      linha({ dia: dia(1), total: 1500 }),
      linha({ dia: dia(0), total: 1200 }),
    ];
    const { result } = renderHook(() => useSentimentTrend(30), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    const serie = result.current.data!;
    expect(serie[serie.length - 1].date).toBe(dia(0));
    expect(serie.map((d) => d.date)).toEqual([dia(30), dia(1), dia(0)]);
  });

  it('dia sem análise (total 0) fica FORA da série — não inventa 0% (IA-023)', async () => {
    linhas = [linha({ dia: dia(2), total: 0, positivos: 0, neutros: 0, negativos: 0, indice: null }), linha({ dia: dia(1) })];
    const { result } = renderHook(() => useSentimentTrend(7), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data!.map((d) => d.date)).toEqual([dia(1)]);
  });

  it('erro da RPC vira `error` no hook (não vira lista vazia)', async () => {
    erro = new Error('sentiment_trend indisponível');
    const { result } = renderHook(() => useSentimentTrend(7), { wrapper });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    expect(result.current.data).toBeNull();
    expect(result.current.error?.message).toBe('sentiment_trend indisponível');
  });

  it('o mapeamento ordena a série por dia e aceita numeric como string (PostgREST)', () => {
    const serie = mapTrendRows([
      { dia: '2026-10-16', total: '4', positivos: '3', neutros: '1', negativos: '0', media: '80.50', indice: '0.75' },
      { dia: '2026-10-14', total: '0', positivos: '0', neutros: '0', negativos: '0', media: null, indice: null },
      { dia: '2026-10-15', total: '10', positivos: '5', neutros: '3', negativos: '2', media: '10.00', indice: '0.3' },
    ]);

    expect(serie.map((d) => d.date)).toEqual(['2026-10-15', '2026-10-16']);
    expect({ p: serie[0].positive, n: serie[0].negative }).toEqual({ p: 50, n: 20 });
    // media '10.00' => 10/50 - 1 = -0.8 (o `indice` 0.3 do mesmo dia não manda).
    expect(serie[0].avg_score).toBeCloseTo(-0.8, 4);
    // media '80.50' => 80.5/50 - 1 = 0.61.
    expect(serie[1].avg_score).toBeCloseTo(0.61, 4);
  });
});

describe('variação do sentimento — período atual × anterior, ponderado', () => {
  const r = (d: string, total: number, positivos: number, negativos: number, media: number | null) =>
    ({ dia: d, total, positivos, neutros: total - positivos - negativos, negativos, media, indice: null });

  it('separa os dias mais recentes como período atual e o resto como anterior', () => {
    const { current, previous } = splitWindows([
      r('2026-10-04', 2, 1, 0, 60), r('2026-10-01', 4, 1, 1, 50),
      r('2026-10-03', 0, 0, 0, null), r('2026-10-02', 5, 2, 1, 55),
    ], 2);
    expect(current.map((d) => d.date)).toEqual(['2026-10-04']);
    expect(previous.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02']);
  });

  it('percentual e score da janela pesam pelo total real de cada dia', () => {
    const janela = summarizeWindow(mapTrendRows([
      r('2026-10-01', 1, 1, 0, 100),
      r('2026-10-02', 99, 0, 99, 0),
    ]))!;
    // Média simples dos dias daria 50% positivo e score 0; o peso real é 1 em 100.
    expect(janela.total).toBe(100);
    expect(janela.positivePct).toBeCloseTo(1, 6);
    expect(janela.negativePct).toBeCloseTo(99, 6);
    expect(janela.avgScore).toBeCloseTo((1 * 1 + -1 * 99) / 100, 6);
  });

  it('variação compara com o período anterior e é null sem base', () => {
    const atual = { total: 10, positivePct: 0, negativePct: 0, avgScore: 0.6 };
    const anterior = { total: 10, positivePct: 0, negativePct: 0, avgScore: 0.4 };
    expect(sentimentDeltaPct(atual, anterior)).toBe(50);
    expect(sentimentDeltaPct(atual, null)).toBeNull();
    expect(sentimentDeltaPct(atual, { ...anterior, avgScore: 0 })).toBeNull();
    expect(summarizeWindow([])).toBeNull();
  });

  it('o hook devolve o período anterior separado da série exibida', async () => {
    linhas = [linha({ dia: dia(3), total: 10, positivos: 2 }), linha({ dia: dia(2) }), linha({ dia: dia(1) }), linha({ dia: dia(0) })];
    const { result } = renderHook(() => useSentimentTrend(2), { wrapper });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data!.map((d) => d.date)).toEqual([dia(1), dia(0)]);
    expect(result.current.previous!.map((d) => d.date)).toEqual([dia(3), dia(2)]);
  });
});
