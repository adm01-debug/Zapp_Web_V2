/**
 * CV-083, CV-084, CV-085 — Painel de prazo reverso.
 * Exibe a data limite de pedido, progresso visual e detalhamento por fase.
 */
import React from 'react';
import { cn } from '@/lib/utils';
import type { DeadlineResult } from '@/hooks/copilot/useReverseDeadline';

export interface DeadlinePanelProps {
  deadline: DeadlineResult | null;
  className?: string;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function colorClass(deadline: DeadlineResult): { text: string; bar: string; bg: string } {
  if (!deadline.isPossible) {
    return { text: 'text-red-700', bar: 'bg-red-500', bg: 'bg-red-50 border-red-200' };
  }
  if (deadline.isUrgent) {
    return { text: 'text-yellow-700', bar: 'bg-yellow-500', bg: 'bg-yellow-50 border-yellow-200' };
  }
  return { text: 'text-green-700', bar: 'bg-green-500', bg: 'bg-green-50 border-green-200' };
}

export function DeadlinePanel({ deadline, className }: DeadlinePanelProps) {
  if (!deadline) return null;

  const totalDays = deadline.phaseBreakdown.reduce<number>((acc, phase) => {
    const ms = phase.endDate.getTime() - phase.startDate.getTime();
    return acc + Math.round(ms / 86_400_000);
  }, 0) || 1;

  const elapsed = Math.max(0, totalDays - deadline.daysRemaining);
  const progressPct = deadline.isPossible
    ? Math.min(100, Math.round((elapsed / totalDays) * 100))
    : 100;

  const colors = colorClass(deadline);

  return (
    <div className={cn('rounded-lg border p-4', colors.bg, className)}>
      {/* Header */}
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Prazo limite para pedido
      </h3>

      {/* Main date */}
      <p className={cn('text-2xl font-bold', colors.text)}>
        {formatDate(deadline.latestOrderDate)}
      </p>

      <p className="mt-0.5 text-xs text-gray-500">
        {deadline.isPossible
          ? `${deadline.daysRemaining} dia${deadline.daysRemaining === 1 ? '' : 's'} útil${deadline.daysRemaining === 1 ? '' : 'eis'} restante${deadline.daysRemaining === 1 ? '' : 's'}`
          : 'Data de evento insuficiente para produção padrão'}
      </p>

      {/* Progress bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn('h-full rounded-full transition-all', colors.bar)}
          style={{ width: `${progressPct}%` }}
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Urgency / impossible message */}
      {deadline.urgencyMessage && (
        <p className="mt-2 text-xs font-medium text-yellow-700">
          ⚠ {deadline.urgencyMessage}
        </p>
      )}
      {deadline.impossibleAlternative && (
        <p className="mt-2 text-xs text-red-700">
          💡 {deadline.impossibleAlternative}
        </p>
      )}

      {/* Phase breakdown */}
      <div className="mt-3 flex flex-col gap-1">
        <p className="text-xs font-semibold text-gray-500">Fases de produção</p>
        {deadline.phaseBreakdown.map(({ phase, startDate, endDate }) => (
          <div
            key={phase}
            className="flex items-center justify-between text-xs text-gray-600"
          >
            <span>{phase}</span>
            <span className="text-gray-400">
              {formatDate(startDate)} → {formatDate(endDate)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
