import { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Smile, Meh, Frown, AlertTriangle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSentimentTrend } from '@/hooks/analytics/useSentimentTrend';

export interface SentimentData {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  avg_score: number;
  alerts_count: number;
}

/**
 * Série diária de sentimento, num formato compatível com os consumidores
 * antigos (`SentimentTrendCard`). O cálculo real — janela no fuso do app,
 * leitura paginada sem corte e classificação canônica — mora em
 * `useSentimentTrend` (achado P1-D). Devolve `null` no vazio e no erro, como
 * antes; quem precisa distinguir os dois usa o hook direto.
 */
export function useRealSentimentData(days: number): SentimentData[] | null {
  const trend = useSentimentTrend(days);
  if (trend.isLoading || trend.isError) return null;
  if (trend.isEmpty) return null;
  // Só os dias com análise, como o formato antigo deste hook (quem desenha a
  // tendência dia a dia usa `useSentimentTrend`, que devolve a janela inteira).
  return trend.series
    .filter((dia) => dia.total > 0)
    .map((dia) => ({
      date: dia.date,
      positive: dia.positive,
      neutral: dia.neutral,
      negative: dia.negative,
      avg_score: dia.avgScore,
      alerts_count: dia.alerts_count,
    }));
}

export function SentimentIcon({ score }: { score: number }) {
  if (score >= 0.3) return <Smile className="w-5 h-5 text-success" />;
  if (score >= -0.3) return <Meh className="w-5 h-5 text-warning" />;
  return <Frown className="w-5 h-5 text-destructive" />;
}

export function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  const percentage = previous !== 0 ? Math.abs((diff / previous) * 100).toFixed(1) : '0';
  
  if (Math.abs(diff) < 0.05) {
    return (
      <div className="flex items-center gap-1 text-muted-foreground">
        <Minus className="w-4 h-4" />
        <span className="text-xs">Estável</span>
      </div>
    );
  }
  
  if (diff > 0) {
    return (
      <div className="flex items-center gap-1 text-success">
        <TrendingUp className="w-4 h-4" />
        <span className="text-xs">+{percentage}%</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-1 text-destructive">
      <TrendingDown className="w-4 h-4" />
      <span className="text-xs">-{percentage}%</span>
    </div>
  );
}

export function SentimentStatsCards({ stats }: { stats: { avgScore: number; totalAlerts: number; avgPositive: number; avgNegative: number; recentAvg: number; previousAvg: number } }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-3 rounded-lg bg-muted/50">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Score Médio</span>
          <SentimentIcon score={stats.avgScore} />
        </div>
        <p className={cn('text-xl font-bold', stats.avgScore >= 0.3 ? 'text-success' : stats.avgScore >= -0.3 ? 'text-warning' : 'text-destructive')}>
          {(stats.avgScore * 100).toFixed(0)}
        </p>
        <TrendIndicator current={stats.recentAvg} previous={stats.previousAvg} />
      </motion.div>
      
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-3 rounded-lg bg-success/10">
        <span className="text-xs text-muted-foreground">Positivo</span>
        <p className="text-xl font-bold text-success">{stats.avgPositive.toFixed(1)}%</p>
        <span className="text-xs text-muted-foreground">média</span>
      </motion.div>
      
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="p-3 rounded-lg bg-destructive/10">
        <span className="text-xs text-muted-foreground">Negativo</span>
        <p className="text-xl font-bold text-destructive">{stats.avgNegative.toFixed(1)}%</p>
        <span className="text-xs text-muted-foreground">média</span>
      </motion.div>
      
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="p-3 rounded-lg bg-destructive/10">
        <div className="flex items-center gap-1 mb-1">
          <AlertTriangle className="w-3 h-3 text-destructive" />
          <span className="text-xs text-muted-foreground">Alertas</span>
        </div>
        <p className="text-xl font-bold text-destructive">{stats.totalAlerts}</p>
        <span className="text-xs text-muted-foreground">no período</span>
      </motion.div>
    </div>
  );
}

interface SentimentDataPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  alerts_count: number;
}

interface TooltipPayloadItem {
  payload: SentimentDataPoint;
}

export interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

export const SentimentCustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload || !payload.length || !label) return null;
  
  const data = payload[0]?.payload;
  if (!data) return null;
  
  return (
    <div className="bg-popover border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-2">{format(new Date(label), "dd 'de' MMMM", { locale: ptBR })}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-success" />Positivo</span>
          <span className="font-medium">{data.positive}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-warning" />Neutro</span>
          <span className="font-medium">{data.neutral}%</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-destructive" />Negativo</span>
          <span className="font-medium">{data.negative}%</span>
        </div>
        {data.alerts_count > 0 && (
          <div className="pt-2 border-t mt-2">
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="w-3 h-3" />
              {data.alerts_count} alertas
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
