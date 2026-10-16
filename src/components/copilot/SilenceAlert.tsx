import React from 'react';
import type { SilenceAlert as SilenceAlertData } from '../../hooks/copilot/useFollowUp';

export interface SilenceAlertProps {
  alert: SilenceAlertData | null;
  onFollowUp: () => void;
  onDismiss: () => void;
  className?: string;
}

const PRIORITY_CONFIG = {
  low: {
    bgColor: 'bg-yellow-50 dark:bg-yellow-950',
    borderColor: 'border-yellow-400',
    textColor: 'text-yellow-800 dark:text-yellow-200',
    buttonColor: 'bg-yellow-500 hover:bg-yellow-600 text-white',
    icon: '🌡️',
    label: 'Silêncio',
  },
  medium: {
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    borderColor: 'border-orange-500',
    textColor: 'text-orange-800 dark:text-orange-200',
    buttonColor: 'bg-orange-500 hover:bg-orange-600 text-white',
    icon: '⏰',
    label: 'Esfriando',
  },
  high: {
    bgColor: 'bg-red-50 dark:bg-red-950',
    borderColor: 'border-red-600',
    textColor: 'text-red-800 dark:text-red-200',
    buttonColor: 'bg-red-600 hover:bg-red-700 text-white',
    icon: '🚨',
    label: 'Crítico',
  },
} as const;

const TEMPERATURE_LABELS: Record<string, string> = {
  cold: 'frio',
  warm: 'morno',
  hot: 'quente',
  closing: 'em fechamento',
};

function formatDays(days: number): string {
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}h`;
  }
  if (days === 1) return '1 dia';
  return `${Math.round(days)} dias`;
}

export function SilenceAlert({ alert, onFollowUp, onDismiss, className = '' }: SilenceAlertProps) {
  if (!alert) return null;

  const config = PRIORITY_CONFIG[alert.priority];
  const tempLabel = TEMPERATURE_LABELS[alert.lastTemperature] ?? alert.lastTemperature;

  return (
    <div
      className={`rounded-lg border-l-4 p-3 ${
        config.bgColor
      } ${config.borderColor} ${className}`}
      role="alert"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <span className="text-base" aria-hidden="true">{config.icon}</span>
          <div>
            <p className={`text-sm font-semibold ${config.textColor}`}>
              {config.label} — {formatDays(alert.daysSilent)} sem resposta
            </p>
            <p className={`mt-0.5 text-xs ${config.textColor} opacity-80`}>
              Lead {tempLabel}
              {alert.estimatedValue
                ? ` · Valor estimado: R$ ${alert.estimatedValue.toLocaleString('pt-BR')}`
                : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className={`ml-3 shrink-0 text-sm opacity-60 hover:opacity-100 ${config.textColor}`}
          aria-label="Dispensar alerta de silêncio"
        >
          ✕
        </button>
      </div>

      <div className="mt-2">
        <button
          onClick={onFollowUp}
          className={`w-full rounded-md px-3 py-1.5 text-xs font-medium ${
            config.buttonColor
          } transition-colors`}
        >
          Fazer follow-up agora
        </button>
      </div>
    </div>
  );
}
