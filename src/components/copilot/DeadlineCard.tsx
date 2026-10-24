import React from 'react';
import { cn } from '@/lib/utils';
import type { DeadlineBreakdown, FreightEstimate } from '@/hooks/copilot/useDeadlineCalculator';

export interface DeadlineCardProps {
  deadline: DeadlineBreakdown;
  freightEstimate?: FreightEstimate | null;
  impossibleDeadline?: boolean;
  impossibleReason?: string;
  onDismiss?: () => void;
  className?: string;
}

export function DeadlineCard({
  deadline,
  freightEstimate,
  impossibleDeadline = false,
  impossibleReason,
  onDismiss,
  className,
}: DeadlineCardProps) {
  const borderColor = impossibleDeadline
    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950'
    : 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950';

  return (
    <div className={cn('rounded-lg border p-3 text-sm', borderColor, className)}>
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            'font-medium',
            impossibleDeadline
              ? 'text-red-700 dark:text-red-300'
              : 'text-blue-700 dark:text-blue-300',
          )}
        >
          {impossibleDeadline ? '⚠️ Prazo inviável' : 'Calculadora de prazo'}
        </span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Fechar"
            className="text-blue-400 hover:text-blue-600 dark:text-blue-500"
          >
            ×
          </button>
        )}
      </div>

      {impossibleDeadline && impossibleReason && (
        <p className="mb-2 text-red-700 dark:text-red-200">{impossibleReason}</p>
      )}

      {!impossibleDeadline && (
        <>
          <p className="text-blue-800 dark:text-blue-100">
            <span className="font-medium">Pedido até:</span>{' '}
            <span className="highlight font-semibold">
              {new Date(deadline.latestOrderDate).toLocaleDateString('pt-BR')}
            </span>
          </p>
          <p className="text-blue-700 dark:text-blue-200">
            Produção: {deadline.productionDays}d • Frete: {deadline.shippingDays}d • Buffer:{' '}
            {deadline.bufferDays}d
          </p>
        </>
      )}

      {freightEstimate && (
        <p className="mt-1 text-blue-600 dark:text-blue-300">
          Frete estimado: {freightEstimate.estimatedCost} • {freightEstimate.minDays}–
          {freightEstimate.maxDays} dias ({freightEstimate.carrier})
        </p>
      )}
    </div>
  );
}
