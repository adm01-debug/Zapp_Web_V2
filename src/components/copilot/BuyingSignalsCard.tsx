import React from 'react';
import { cn } from '@/lib/utils';
import type { BuyingSignal } from '@/hooks/copilot/useLeadTemperature';

export interface BuyingSignalsCardProps {
  signals: BuyingSignal[];
  whatsapp24hWarning?: boolean;
  silenceAlertMinutes?: number | null;
  onDismiss?: () => void;
  className?: string;
}

const SIGNAL_LABELS: Record<BuyingSignal['type'], string> = {
  urgency: 'Urgência',
  budget_confirmed: 'Orçamento confirmado',
  decision_authority: 'Decisor',
  specific_need: 'Necessidade específica',
  timeline: 'Cronograma',
};

const STRENGTH_COLOR: Record<BuyingSignal['strength'], string> = {
  weak: 'text-gray-500',
  moderate: 'text-yellow-600 dark:text-yellow-400',
  strong: 'text-green-600 dark:text-green-400',
};

export function BuyingSignalsCard({
  signals,
  whatsapp24hWarning = false,
  silenceAlertMinutes,
  onDismiss,
  className,
}: BuyingSignalsCardProps) {
  if (!signals.length && !whatsapp24hWarning && !silenceAlertMinutes) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-950',
        className,
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-green-800 dark:text-green-300">Sinais de compra</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Fechar"
            className="text-green-500 hover:text-green-700 dark:text-green-400"
          >
            ×
          </button>
        )}
      </div>

      {signals.map((signal, i) => (
        <div key={i} className="mb-1 flex items-start gap-1">
          <span className={cn('font-medium', STRENGTH_COLOR[signal.strength])}>
            {SIGNAL_LABELS[signal.type]}:
          </span>
          <span className="text-green-800 dark:text-green-100">{signal.excerpt}</span>
        </div>
      ))}

      {whatsapp24hWarning && (
        <p className="mt-1 font-medium text-yellow-700 dark:text-yellow-300">
          ⏰ Janela de 24h do WhatsApp se encerrando em breve.
        </p>
      )}

      {silenceAlertMinutes !== null && silenceAlertMinutes !== undefined && (
        <p className="mt-1 text-orange-600 dark:text-orange-300">
          🔇 Lead sem resposta há {silenceAlertMinutes} minutos.
        </p>
      )}
    </div>
  );
}
