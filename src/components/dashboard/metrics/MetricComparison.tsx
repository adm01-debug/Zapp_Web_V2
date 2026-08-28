import * as React from 'react';
import { cn } from '@/lib/utils';
import { TrendDirection } from './types';
import { TrendIndicator } from './TrendIndicator';

interface MetricComparisonProps {
  label: string;
  current: number;
  previous: number;
  format?: (value: number) => string;
  className?: string;
}

export function MetricComparison({ label, current, previous, format = (v) => v.toLocaleString('pt-BR'), className }: MetricComparisonProps) {
  const diff = current - previous;
  const percentChange = previous > 0 ? ((diff / previous) * 100) : 0;
  const trend: TrendDirection = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';

  return (
    <div className={cn('flex items-center justify-between py-2', className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-medium text-foreground">{format(current)}</div>
          <div className="text-xs text-muted-foreground">vs {format(previous)}</div>
        </div>
        <TrendIndicator direction={trend} value={Math.abs(Math.round(percentChange))} />
      </div>
    </div>
  );
}
