import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  trend: 'up' | 'down';
  peakTime: string;
  capacityRisk: boolean;
}

function generatePredictionFromHistory(messageHistory: { hour: number; count: number }[]): PredictionPoint[] {
  const now = new Date();
  const data: PredictionPoint[] = [];

  const hourlyAvg = new Map<number, number>();
  messageHistory.forEach(({ hour, count }) => hourlyAvg.set(hour, count));

  for (let i = -4; i <= 0; i++) {
    const time = new Date(now.getTime() + i * 60 * 60 * 1000);
    const hourCount = hourlyAvg.get(time.getHours()) || 0;
    data.push({
      time: time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      actual: hourCount, predicted: hourCount, lower: hourCount, upper: hourCount, isPrediction: false,
    });
  }

  for (let i = 1; i <= 4; i++) {
    const time = new Date(now.getTime() + i * 60 * 60 * 1000);
    const predicted = hourlyAvg.get(time.getHours()) || 0;
    const variance = Math.max(2, Math.round(predicted * 0.2)) + i;
    data.push({
      time: time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      predicted, lower: Math.max(0, predicted - variance), upper: predicted + variance, isPrediction: true,
    });
  }

  return data;
}

export function useDemandPrediction(externalData?: PredictionPoint[], currentCapacity = 35) {
  const { data: messageHistory = [] } = useQuery({
    queryKey: ['demand-prediction-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      if (error) throw error;

      const hourCounts = new Map<number, number[]>();
      (data || []).forEach(m => {
        const hour = new Date(m.created_at).getHours();
        if (!hourCounts.has(hour)) hourCounts.set(hour, []);
        hourCounts.get(hour)!.push(1);
      });

      return Array.from(hourCounts.entries()).map(([hour, counts]) => ({
        hour, count: Math.round(counts.length / 7),
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = externalData || generatePredictionFromHistory(messageHistory);

  const insights = useMemo<DemandInsights>(() => {
    const predictions = data.filter(d => d.isPrediction);
    const maxPredicted = Math.max(...predictions.map(p => p.predicted));
    const avgPredicted = predictions.reduce((a, b) => a + b.predicted, 0) / predictions.length;
    const currentActual = data.find(d => !d.isPrediction && d.actual !== undefined)?.actual || 0;
    const trend = predictions[predictions.length - 1].predicted > currentActual ? 'up' : 'down';
    const peakTime = predictions.find(p => p.predicted === maxPredicted)?.time || '';
    const capacityRisk = maxPredicted > currentCapacity;
    return { maxPredicted, avgPredicted, currentActual, trend, peakTime, capacityRisk };
  }, [data, currentCapacity]);

  return { data, insights };
}
