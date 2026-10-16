import React from 'react';
import type { ThermometerState, LeadTemperature } from '../../hooks/copilot/useLeadThermometer';

export interface LeadThermometerProps {
  thermometer: ThermometerState;
  className?: string;
}

const TEMPERATURE_CONFIG: Record<
  LeadTemperature,
  { label: string; color: string; bgColor: string; barColor: string }
> = {
  cold: {
    label: 'Frio',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    barColor: 'bg-blue-500',
  },
  warm: {
    label: 'Morno',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950',
    barColor: 'bg-green-500',
  },
  hot: {
    label: 'Quente',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    barColor: 'bg-orange-500',
  },
  closing: {
    label: 'Fechamento!',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950',
    barColor: 'bg-red-500',
  },
};

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  order_question: 'Perguntou sobre pedido',
  payment_question: 'Perguntou sobre pagamento',
  art_mention: 'Mencionou arte/logo',
  price_confirmation: 'Confirmou preço',
  deadline_press: 'Tem prazo pressionado',
};

export function LeadThermometer({ thermometer, className = '' }: LeadThermometerProps) {
  const config = TEMPERATURE_CONFIG[thermometer.temperature];

  return (
    <div className={`rounded-lg border p-3 ${config.bgColor} ${className}`}>
      {/* Close banner */}
      {thermometer.shouldSuggestClose && (
        <div className="mb-3 rounded-md bg-red-600 px-3 py-2 text-center text-sm font-semibold text-white">
          🔥 Hora de fechar! {thermometer.closeMessage}
        </div>
      )}

      {/* Score + label */}
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-sm font-semibold ${config.color}`}>
          Termômetro do Lead
        </span>
        <span className={`text-lg font-bold ${config.color}`}>
          {thermometer.score}/100 — {config.label}
        </span>
      </div>

      {/* Bar */}
      <div className="mb-3 h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full transition-all duration-500 ${config.barColor}`}
          style={{ width: `${thermometer.score}%` }}
          role="progressbar"
          aria-valuenow={thermometer.score}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* BRINDE completion */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">BRINDE:</span>
        <div className="flex gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className={`h-2 w-4 rounded-sm ${
                i < thermometer.brindeCompletion
                  ? config.barColor
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {thermometer.brindeCompletion}/6
        </span>
      </div>

      {/* Buy signals */}
      {thermometer.signals.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
            Sinais de compra:
          </p>
          <ul className="space-y-0.5">
            {thermometer.signals.map((signal, idx) => (
              <li key={idx} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                <span className="text-green-500">●</span>
                {SIGNAL_TYPE_LABELS[signal.type] ?? signal.type}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
