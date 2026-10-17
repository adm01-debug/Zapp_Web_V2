/**
 * CV-034 — Indicador de etapa da venda (E1–E6) com temperatura de compra.
 */
import React from 'react';
import { cn } from '@/lib/utils';

const STAGE_META: Record<string, { label: string; color: string }> = {
  E1: { label: 'Recepção', color: 'bg-sky-500/20 text-sky-700 dark:text-sky-300' },
  E2: { label: 'Descoberta', color: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' },
  E3: { label: 'Proposta', color: 'bg-violet-500/20 text-violet-700 dark:text-violet-300' },
  E4: { label: 'Negociação', color: 'bg-orange-500/20 text-orange-700 dark:text-orange-300' },
  E5: { label: 'Fechamento', color: 'bg-green-500/20 text-green-700 dark:text-green-300' },
  E6: { label: 'Pós-venda', color: 'bg-teal-500/20 text-teal-700 dark:text-teal-300' },
};

interface StageIndicatorProps {
  stage: string;
  temperature: number;
  confidence?: number;
}

export function StageIndicator({ stage, temperature, confidence }: StageIndicatorProps) {
  const meta = STAGE_META[stage] ?? { label: stage, color: 'bg-muted text-muted-foreground' };
  const tempColor =
    temperature >= 8 ? 'bg-green-500' :
    temperature >= 5 ? 'bg-yellow-400' :
    temperature >= 2 ? 'bg-orange-400' : 'bg-slate-400';

  return (
    <div className="flex items-center gap-2">
      <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', meta.color)}>
        {stage} · {meta.label}
      </span>
      <div
        className="flex items-center gap-0.5"
        aria-label={`Temperatura de compra: ${temperature}/10`}
        title={`Temperatura ${temperature}/10`}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 w-1.5 rounded-sm transition-colors',
              i < temperature ? tempColor : 'bg-muted',
            )}
          />
        ))}
      </div>
      {confidence !== undefined && (
        <span className="text-[10px] text-muted-foreground">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  );
}
