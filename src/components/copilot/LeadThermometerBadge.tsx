/**
 * CV-091 — LeadThermometerBadge
 *
 * Badge compacto que exibe a temperatura do lead com ação recomendada.
 */
import { Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadThermometerResult } from '@/hooks/copilot/useLeadThermometer';

const TEMP_CONFIG = {
  cold: { label: 'Frio', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  warm: { label: 'Morno', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  hot: { label: 'Quente', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
};

interface LeadThermometerBadgeProps {
  result: LeadThermometerResult;
  className?: string;
}

export function LeadThermometerBadge({ result, className }: LeadThermometerBadgeProps) {
  const cfg = TEMP_CONFIG[result.temperature];
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cfg.bg, cfg.color)}>
        <Thermometer className="w-3 h-3" />
        {cfg.label}
      </span>
      <span className="text-xs text-muted-foreground">{result.recommendedAction}</span>
    </div>
  );
}
