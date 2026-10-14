import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { appHour } from '@/lib/localDay';

export interface PredictionPoint {
  time: string;
  actual?: number;
  predicted: number;
  lower: number;
  upper: number;
  isPrediction?: boolean;
}

export interface DemandInsights {
  maxPredicted: number;
  avgPredicted: number;
  currentActual: number;
  trend: 'up' | 'down' | 'stable';
  peakTime: string;
  capacityRisk: boolean;
}

/** Bucket agregado da RPC dashboard_heatmap: 1 linha por (dia da semana, hora). */
export interface HeatmapBucket {
  dow: number;
  hour: number;
  value: number;
}

/**
 * Perfil horario medio a partir do agregado do servidor (dashboard_heatmap, dias=28):
 * cada linha e (dia da semana, hora) com as mensagens RECEBIDAS ja somadas no banco,
 * no fuso do app (America/Sao_Paulo). A media por hora = total daquela hora na janela
 * de 28 dias / 28 dias. Substitui a leitura de 7 dias de linhas cruas de `messages`
 * (o corte silencioso de 1000 do PostgREST encurtava a janela de 7 dias) e o
 * getHours() do NAVEGADOR, que jogava o horario para outro bucket fora de SP.
 */
export function hourlyProfileFromHeatmap(
  buckets: HeatmapBucket[],
  dias = 28,
): { hour: number; count: number }[] {
  const diasJanela = dias > 0 ? dias : 1;
  const totals = new Array<number>(24).fill(0);
  for (const b of buckets) {
    if (b.hour < 0 || b.hour > 23) continue;
    totals[b.hour] += Number(b.value ?? 0);
  }
  return totals.map((total, hour) => ({ hour, count: Math.round(total / diasJanela) }));
}

export function generatePredictionFromHistory(
  messageHistory: { hour: number; count: number }[],
  now: Date = new Date(),
): PredictionPoint[] {
  const data: PredictionPoint[] = [];
  const hourlyAvg = new Map<number, number>();
  messageHistory.forEach(({ hour, count }) => hourlyAvg.set(hour, count));

  // Rotulo de hora no fuso do APP (appHour) — o mesmo em que a RPC agregou os buckets.
  // Com getHours()/toLocaleTimeString do navegador a linha da previsao aparecia na
  // hora errada no VolumeChart para quem abria o painel fora de America/Sao_Paulo.
  const label = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  for (let i = -4; i <= 0; i++) {
    const hour = appHour(new Date(now.getTime() + i * 60 * 60 * 1000));
    const hourCount = hourlyAvg.get(hour) ?? 0;
    data.push({
      time: label(hour),
      actual: hourCount, predicted: hourCount, lower: hourCount, upper: hourCount, isPrediction: false,
    });
  }

  for (let i = 1; i <= 4; i++) {
    const hour = appHour(new Date(now.getTime() + i * 60 * 60 * 1000));
    const predicted = hourlyAvg.get(hour) ?? 0;
    const variance = Math.max(2, Math.round(predicted * 0.2)) + i;
    data.push({
      time: label(hour),
      predicted, lower: Math.max(0, predicted - variance), upper: predicted + variance, isPrediction: true,
    });
  }

  return data;
}

/** Insights do painel. Sem pontos de previsao devolve 'Estavel' e zeros — nunca NaN. */
export function buildDemandInsights(data: PredictionPoint[], currentCapacity: number): DemandInsights {
  const predictions = data.filter(d => d.isPrediction);
  const currentActual = data.find(d => !d.isPrediction && d.actual !== undefined)?.actual ?? 0;

  if (predictions.length === 0) {
    return {
      maxPredicted: 0, avgPredicted: 0, currentActual,
      trend: 'stable', peakTime: '', capacityRisk: false,
    };
  }

  const maxPredicted = Math.max(...predictions.map(p => p.predicted));
  const avgPredicted = predictions.reduce((a, b) => a + b.predicted, 0) / predictions.length;
  const lastPredicted = predictions[predictions.length - 1].predicted;
  const trend: DemandInsights['trend'] =
    lastPredicted > currentActual ? 'up' : lastPredicted < currentActual ? 'down' : 'stable';
  const peakTime = predictions.find(p => p.predicted === maxPredicted)?.time ?? '';
  const capacityRisk = maxPredicted > currentCapacity;

  return { maxPredicted, avgPredicted, currentActual, trend, peakTime, capacityRisk };
}

export function useDemandPrediction(externalData?: PredictionPoint[], currentCapacity = 35) {
  const { data: messageHistory = [] } = useQuery({
    queryKey: ['demand-prediction-history'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_heatmap', { dias: 28 });
      if (error) throw error;
      return hourlyProfileFromHeatmap((data ?? []) as HeatmapBucket[], 28);
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = externalData || generatePredictionFromHistory(messageHistory);

  const insights = useMemo(
    () => buildDemandInsights(data, currentCapacity),
    [data, currentCapacity],
  );

  return { data, insights };
}
