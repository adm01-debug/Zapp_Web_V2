import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

/** Um dia da série de tendência de sentimento, no shape que o gráfico consome. */
export interface SentimentData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  avg_score: number;
  alerts_count: number;
  /** Análises do dia (denominador real dos percentuais). */
  total: number;
  /** Positivos do dia, em contagem. */
  positives: number;
}

/** Resumo de uma janela inteira, ponderado pelo total real de cada dia. */
export interface SentimentWindow {
  total: number;
  positivePct: number;
  negativePct: number;
  /** Score médio em [-1,1], ponderado pelo número de análises de cada dia. */
  avgScore: number;
}

/** Uma linha da RPC `sentiment_trend`: um dia de calendário em America/Sao_Paulo. */
interface SentimentTrendRow {
  dia: string;
  total: number | string;
  positivos: number | string;
  neutros: number | string;
  negativos: number | string;
  media: number | string | null;
  indice: number | string | null;
}

function toNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * `avg_score` do gráfico, em [-1,1]: a média real do dia convertida
 * (`media / 50 - 1`), com o saldo (pos − neg)/total como reserva do dia sem
 * nenhuma nota. Nunca inventa 0/50 (IA-023).
 */
function avgScore(row: SentimentTrendRow): number {
  const media = toNumberOrNull(row.media);
  if (media !== null) return media / 50 - 1;
  return toNumberOrNull(row.indice) ?? 0;
}

/**
 * Traduz a série da RPC (agregada no servidor) para o shape do gráfico.
 *
 * * `media` é a média REAL de `sentiment_score` (0..100, medida no servidor).
 *   O `avg_score` do gráfico vive em [-1,1] porque é o que ele converte com
 *   `(avg_score + 1) * 50`: `media / 50 - 1` devolve exatamente a média real na
 *   escala 0..100 do gráfico. Antes o `avg_score` era (pos − neg)/total,
 *   calculado no navegador sobre a fatia de 1000 linhas.
 * * Dia com análise e NENHUMA nota (`media` null): não existe média real e o
 *   `indice` do próprio dia é o único sinal disponível — preferimos ele a
 *   inventar 0, que o gráfico leria como 50 (neutro) — IA-023.
 * * A contagem canônica (crítico = negativo, valor desconhecido fora de todos
 *   os baldes) também é do servidor: `negativos` já soma `critico`
 *   (IA-SENTIMENT-001), então a soma dos baldes pode ficar abaixo de 100%.
 * * Dia sem nenhuma análise (`total` 0) fica FORA da série: percentual de dia
 *   vazio seria um 0% inventado, que o gráfico mostraria como "nada positivo"
 *   (IA-023 — ausência não vira valor).
 */
export function mapTrendRows(rows: SentimentTrendRow[]): SentimentData[] {
  return rows
    .filter((row) => (toNumberOrNull(row.total) ?? 0) > 0)
    .slice()
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((row) => {
      const total = toNumberOrNull(row.total) ?? 0;
      const positivos = toNumberOrNull(row.positivos) ?? 0;
      const neutros = toNumberOrNull(row.neutros) ?? 0;
      const negativos = toNumberOrNull(row.negativos) ?? 0;
      return {
        date: row.dia,
        positive: Math.round((positivos / total) * 100),
        neutral: Math.round((neutros / total) * 100),
        negative: Math.round((negativos / total) * 100),
        avg_score: avgScore(row),
        alerts_count: negativos,
        total,
        positives: positivos,
      };
    });
}

/**
 * Resume a janela: percentuais = Σcontagem / Σtotal e score ponderado pelo total
 * de cada dia. Um dia com 1 análise não pesa o mesmo que um dia com 500.
 * `null` quando a janela não tem nenhuma análise (não há base).
 */
export function summarizeWindow(series: SentimentData[] | null): SentimentWindow | null {
  if (!series) return null;
  let total = 0;
  let positives = 0;
  let negatives = 0;
  let scoreSum = 0;
  for (const d of series) {
    total += d.total;
    positives += d.positives;
    negatives += d.alerts_count;
    scoreSum += d.avg_score * d.total;
  }
  if (total === 0) return null;
  return {
    total,
    positivePct: (positives / total) * 100,
    negativePct: (negatives / total) * 100,
    avgScore: scoreSum / total,
  };
}

/** Variação % do score da janela atual sobre a anterior; `null` sem base. */
export function sentimentDeltaPct(current: SentimentWindow | null, previous: SentimentWindow | null): number | null {
  if (!current || !previous || previous.avgScore === 0) return null;
  return Math.round(((current.avgScore - previous.avgScore) / Math.abs(previous.avgScore)) * 100);
}

/**
 * Separa a resposta da RPC (pedida com `2 × days`) em período atual (os
 * `days` dias mais recentes) e período anterior de mesmo tamanho. A RPC devolve
 * um balde por dia de calendário, inclusive os vazios (`generate_series`),
 * então o corte por posição coincide com o corte por data.
 */
export function splitWindows(rows: SentimentTrendRow[], days: number): { current: SentimentData[]; previous: SentimentData[] } {
  const sorted = rows.slice().sort((a, b) => a.dia.localeCompare(b.dia));
  const cut = Math.max(0, sorted.length - days);
  return { current: mapTrendRows(sorted.slice(cut)), previous: mapTrendRows(sorted.slice(0, cut)) };
}

/**
 * Série diária da tendência de sentimento, agregada no servidor.
 *
 * HZ2-003: o `select` anterior não tinha limite e, com ordem ASCENDENTE, o
 * corte de 1000 linhas do PostgREST levava embora justamente os DIAS MAIS
 * NOVOS; o agrupamento usava o fuso do navegador e o `avg_score` era
 * (pos − neg)/total. Agora a RPC `sentiment_trend` (SECURITY INVOKER, respeita
 * a RLS de conversation_analyses) devolve um balde por dia do período.
 *
 * O erro é DEVOLVIDO (não engolido): a tela mostra o aviso, em vez de fingir
 * "sem dados no período".
 */
export function useSentimentTrend(days: number): {
  data: SentimentData[] | null;
  /** Série do período anterior de mesmo tamanho (base da variação). */
  previous: SentimentData[] | null;
  error: Error | null;
  isLoading: boolean;
} {
  const { data, error, isLoading } = useQuery({
    queryKey: ['sentiment-trend', days, 'com-periodo-anterior'],
    queryFn: async () => {
      // Cast local via 'any' até o types.ts (gerado, não sincronizado no
      // self-hosted) conhecer a RPC — mesma prática de
      // `dashboard_sentiment_alerts` em useSentimentData.ts.
      const { data: rows, error: rpcError } = await (supabase as any).rpc('sentiment_trend', { p_days: days * 2 }); // eslint-disable-line @typescript-eslint/no-explicit-any -- RPC nova (HZ2-003), types.ts ainda não sincronizado
      if (rpcError) throw rpcError;
      return splitWindows((rows ?? []) as SentimentTrendRow[], days);
    },
    staleTime: 5 * 60 * 1000,
  });

  return {
    data: data?.current ?? null,
    previous: data?.previous ?? null,
    error: (error as Error | null) ?? null,
    isLoading,
  };
}

/**
 * Leitura da série para quem só quer os dados (cards compactos). O card que
 * precisa mostrar o erro usa `useSentimentTrend`.
 */
export function useRealSentimentData(days: number): SentimentData[] | null {
  return useSentimentTrend(days).data;
}
