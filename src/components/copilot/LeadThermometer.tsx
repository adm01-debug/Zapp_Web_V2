import React from 'react';
import { cn } from '@/lib/utils';
import type { TemperatureLabel } from '@/hooks/copilot/useLeadTemperature';

export interface LeadThermometerProps {
  score: number;
  label: TemperatureLabel;
  className?: string;
}

const LABEL_CONFIG: Record<TemperatureLabel, { text: string; color: string; bg: string }> = {
  cold: { text: 'Frio', color: 'text-blue-600 dark:text-blue-300', bg: 'bg-blue-500' },
  warm: { text: 'Morno', color: 'text-yellow-600 dark:text-yellow-300', bg: 'bg-yellow-400' },
  hot: { text: 'Quente', color: 'text-orange-600 dark:text-orange-300', bg: 'bg-orange-500' },
  burning: { text: 'Fervendo', color: 'text-red-600 dark:text-red-300', bg: 'bg-red-500' },
};

export function LeadThermometer({ score, label, className }: LeadThermometerProps) {
  const { text, color, bg } = LABEL_CONFIG[label];
  const pct = Math.max(0, Math.min(100, score));

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={cn('h-full rounded-full transition-all duration-300', bg)}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className={cn('text-xs font-medium', color)}>
        {text} ({pct})
      </span>
    </div>
  );
}
