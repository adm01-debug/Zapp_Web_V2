/**
 * MetricComparison — canonical, standalone metric comparison suite.
 *
 * This is the FULL-FEATURED version. It exports:
 *   - MetricComparison  ← inline badge (%, ±abs, size variants, format types)
 *   - ComparisonCard    ← card widget with current/previous values + trend row
 *   - TeamComparison    ← percentile bar vs team average/best
 *
 * Supported format types: 'number' | 'percent' | 'time' | 'currency'
 *
 * ─── vs. dashboard/metrics/MetricComparison ────────────────────────────────
 * The metrics/ version is a lightweight labeled-row component used exclusively
 * within the metrics/ sub-module. It integrates with `TrendDirection` from
 * `./types` and the metrics/ TrendIndicator. Do NOT use it outside that module.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * ─── vs. BulkActionsBar ────────────────────────────────────────────────────
 * BulkActionsBar (root): generic inbox action bar, receives BulkAction<T>[] from hook
 * BulkActionsBar (contacts/): contacts-specific, calls Supabase directly
 * Both are intentional — do not merge.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricComparisonProps {
  current: number;
  previous: number;
  format?: 'number' | 'percent' | 'time' | 'currency';
  higherIsBetter?: boolean;
  showAbsolute?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MetricComparison({
  current,
  previous,
  format = 'number',
  higherIsBetter = true,
  showAbsolute = true,
  size = 'md',
  className,
}: MetricComparisonProps) {
  const comparison = useMemo(() => {
    if (previous === 0) {
      return {
        percentChange: current > 0 ? 100 : 0,
        absoluteChange: current,
        trend: current > 0 ? 'up' : 'neutral',
      };
    }

    const percentChange = ((current - previous) / Math.abs(previous)) * 100;
    const absoluteChange = current - previous;
    const trend = percentChange > 1 ? 'up' : percentChange < -1 ? 'down' : 'neutral';

    return { percentChange, absoluteChange, trend };
  }, [current, previous]);

  const isPositive = higherIsBetter 
    ? comparison.trend === 'up'
    : comparison.trend === 'down';
  
  const isNegative = higherIsBetter
    ? comparison.trend === 'down'
    : comparison.trend === 'up';

  const formatValue = (value: number) => {
    switch (format) {
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'time':
        if (Math.abs(value) < 60) return `${Math.round(value)}s`;
        return `${Math.round(value / 60)}min`;
      case 'currency':
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
      default:
        return Math.abs(value) >= 1000 
          ? `${(value / 1000).toFixed(1)}k` 
          : value.toFixed(0);
    }
  };

  const sizeClasses = {
    sm: 'text-xs gap-1',
    md: 'text-sm gap-1.5',
    lg: 'text-base gap-2',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "inline-flex items-center font-medium",
        sizeClasses[size],
        isPositive && "text-success",
        isNegative && "text-destructive",
        comparison.trend === 'neutral' && "text-muted-foreground",
        className
      )}
    >
      {comparison.trend === 'up' && <TrendingUp className={iconSizes[size]} />}
      {comparison.trend === 'down' && <TrendingDown className={iconSizes[size]} />}
      {comparison.trend === 'neutral' && <Minus className={iconSizes[size]} />}
      
      <span>
        {comparison.percentChange > 0 ? '+' : ''}
        {comparison.percentChange.toFixed(1)}%
      </span>

      {showAbsolute && comparison.absoluteChange !== 0 && (
        <span className="text-muted-foreground">
          ({comparison.absoluteChange > 0 ? '+' : ''}
          {formatValue(comparison.absoluteChange)})
        </span>
      )}
    </motion.div>
  );
}

interface ComparisonCardProps {
  title: string;
  currentValue: number;
  previousValue: number;
  currentLabel?: string;
  previousLabel?: string;
  format?: MetricComparisonProps['format'];
  higherIsBetter?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function ComparisonCard({
  title,
  currentValue,
  previousValue,
  currentLabel = 'Atual',
  previousLabel = 'Anterior',
  format = 'number',
  higherIsBetter = true,
  icon,
  className,
}: ComparisonCardProps) {
  const formatDisplayValue = (value: number) => {
    switch (format) {
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'time':
        if (value < 60) return `${Math.round(value)}s`;
        if (value < 3600) return `${Math.round(value / 60)}min`;
        return `${Math.round(value / 3600)}h`;
      case 'currency':
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
      default:
        return value.toLocaleString('pt-BR');
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={cn(
        "p-4 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-colors",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon && <div className="text-primary">{icon}</div>}
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-bold text-foreground">
            {formatDisplayValue(currentValue)}
          </div>
          <div className="text-xs text-muted-foreground">{currentLabel}</div>
        </div>

        <div className="text-right">
          <div className="text-lg text-muted-foreground">
            {formatDisplayValue(previousValue)}
          </div>
          <div className="text-xs text-muted-foreground">{previousLabel}</div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border/50">
        <MetricComparison
          current={currentValue}
          previous={previousValue}
          format={format}
          higherIsBetter={higherIsBetter}
        />
      </div>
    </motion.div>
  );
}

interface TeamComparisonProps {
  agentValue: number;
  teamAverage: number;
  teamBest: number;
  format?: MetricComparisonProps['format'];
  higherIsBetter?: boolean;
  className?: string;
}

export function TeamComparison({
  agentValue,
  teamAverage,
  teamBest,
  format = 'number',
  higherIsBetter = true,
  className,
}: TeamComparisonProps) {
  const percentile = useMemo(() => {
    if (teamBest === teamAverage) return 50;
    const range = teamBest - teamAverage;
    const position = agentValue - teamAverage;
    return Math.min(100, Math.max(0, 50 + (position / range) * 50));
  }, [agentValue, teamAverage, teamBest]);

  const isAboveAverage = higherIsBetter 
    ? agentValue >= teamAverage 
    : agentValue <= teamAverage;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">vs. Média da equipe</span>
        <MetricComparison
          current={agentValue}
          previous={teamAverage}
          format={format}
          higherIsBetter={higherIsBetter}
          showAbsolute={false}
          size="sm"
        />
      </div>

      <div className="relative h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentile}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            isAboveAverage ? "bg-success" : "bg-warning"
          )}
        />
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-muted-foreground/50"
          style={{ left: '50%' }}
        />
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Média</span>
        <span>Melhor</span>
      </div>
    </div>
  );
}
