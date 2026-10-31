/**
 * CV-083 — DeadlineCalcCard
 *
 * Card que exibe o resultado do cálculo de prazo de entrega.
 */
import { Clock, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeadlineResult } from '@/hooks/copilot/useDeadlineCalculator';

const FEASIBILITY_CONFIG = {
  ok: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'border-green-500/30 bg-green-50/50 dark:bg-green-900/10', label: 'Prazo OK' },
  tight: { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10', label: 'Prazo justo' },
  impossible: { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'border-red-500/30 bg-red-50/50 dark:bg-red-900/10', label: 'Prazo insuficiente' },
};

interface DeadlineCalcCardProps {
  result: DeadlineResult;
  onUseSuggestion?: (text: string) => void;
  className?: string;
}

export function DeadlineCalcCard({ result, onUseSuggestion, className }: DeadlineCalcCardProps) {
  const config = FEASIBILITY_CONFIG[result.feasibility];
  const Icon = config.icon;

  return (
    <div className={cn('rounded-lg border p-3', config.bg, className)}>
      <div className="flex items-center gap-1.5">
        <Icon className={cn('w-3.5 h-3.5 shrink-0', config.color)} />
        <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
        <Clock className="w-3 h-3 text-muted-foreground ml-auto" />
        <span className="text-xs text-muted-foreground">{result.productionDays}d produção</span>
      </div>
      <p className="mt-1 text-xs text-foreground/80">{result.message}</p>
      {result.alternatives.length > 0 && (
        <div className="mt-2 space-y-1">
          {result.alternatives.map((alt, i) => (
            <button
              key={i}
              type="button"
              className="block text-xs text-primary hover:underline text-left"
              onClick={() => onUseSuggestion?.(alt)}
            >
              → {alt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
