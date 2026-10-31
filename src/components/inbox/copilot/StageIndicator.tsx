/**
 * CV-034 — Indicador de etapa da venda com temperatura de compra (0–100, em 10 barras).
 */
import React from 'react';
import { cn } from '@/lib/utils';
import { SALE_STAGE_META, isSaleStage } from '@/data/copilot/sale-stages';


interface StageIndicatorProps {
  stage: string;
  temperature: number;
  confidence?: number;
}

export function StageIndicator({ stage, temperature, confidence }: StageIndicatorProps) {
  const meta = isSaleStage(stage)
    ? { label: SALE_STAGE_META[stage].label, color: SALE_STAGE_META[stage].chip }
    : { label: stage, color: 'bg-muted text-muted-foreground' };
  const barras = Math.round(Math.min(100, Math.max(0, temperature)) / 10);
  const tempColor =
    barras >= 8 ? 'bg-green-500' :
    barras >= 5 ? 'bg-yellow-400' :
    barras >= 2 ? 'bg-orange-400' : 'bg-slate-400';

  return (
    <div className="flex items-center gap-2">
      <span className={cn('rounded px-2 py-0.5 text-xs font-semibold', meta.color)}>
        {meta.label}
      </span>
      <div
        className="flex items-center gap-0.5"
        aria-label={`Temperatura de compra: ${temperature}/100`}
        title={`Temperatura ${temperature}/100`}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 w-1.5 rounded-sm transition-colors',
              i < barras ? tempColor : 'bg-muted',
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
