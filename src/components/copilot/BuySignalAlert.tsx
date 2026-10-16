import React from 'react';
import type { BuySignal } from '@/hooks/copilot/useBuySignalDetector';

export interface BuySignalAlertProps {
  signal: BuySignal;
  onDismiss: () => void;
  className?: string;
}

const TYPE_LABELS: Record<BuySignal['type'], string> = {
  payment: 'Pergunta de pagamento',
  artwork: 'Pediu a arte',
  order_process: 'Perguntou como comprar',
  shipping_info: 'Perguntou sobre entrega',
  closing_question: 'Pronto para fechar',
};

const TYPE_ICONS: Record<BuySignal['type'], string> = {
  payment: '💳',
  artwork: '🎨',
  order_process: '🛒',
  shipping_info: '🚚',
  closing_question: '✅',
};

export function BuySignalAlert({ signal, onDismiss, className = '' }: BuySignalAlertProps) {
  const confidencePct = Math.round(signal.confidence * 100);

  return (
    <div
      className={`rounded-lg border-2 border-green-400 bg-green-50 p-3 shadow-sm ${className}`}
      role="alert"
    >
      <div className="mb-1 flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">{TYPE_ICONS[signal.type]}</span>
          <div>
            <p className="text-xs font-semibold text-green-800">
              Hora de fechar! — {TYPE_LABELS[signal.type]}
            </p>
            <p className="mt-0.5 text-[10px] text-green-600">
              "{signal.matchedPhrase}" · confiança {confidencePct}%
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="ml-2 shrink-0 text-green-500 hover:text-green-700"
          aria-label="Dispensar alerta"
        >
          ✕
        </button>
      </div>

      <p className="mt-1.5 text-xs text-green-700">{signal.closingSuggestion}</p>
    </div>
  );
}
