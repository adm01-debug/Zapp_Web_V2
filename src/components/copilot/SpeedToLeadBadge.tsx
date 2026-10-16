import React from 'react';
import type { SpeedToLeadState, AlertLevel } from '../../hooks/copilot/useSpeedToLead';

export interface SpeedToLeadBadgeProps {
  state: SpeedToLeadState;
  onDismiss: () => void;
  className?: string;
}

const ALERT_CONFIG: Record<
  Exclude<AlertLevel, 'none'>,
  { bgColor: string; borderColor: string; textColor: string; icon: string }
> = {
  vendor_2min: {
    bgColor: 'bg-yellow-50 dark:bg-yellow-950',
    borderColor: 'border-yellow-400',
    textColor: 'text-yellow-800 dark:text-yellow-200',
    icon: '⚡',
  },
  vendor_5min: {
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    borderColor: 'border-orange-500',
    textColor: 'text-orange-800 dark:text-orange-200',
    icon: '🔔',
  },
  supervisor: {
    bgColor: 'bg-red-50 dark:bg-red-950',
    borderColor: 'border-red-600',
    textColor: 'text-red-800 dark:text-red-200',
    icon: '🚨',
  },
};

export function SpeedToLeadBadge({ state, onDismiss, className = '' }: SpeedToLeadBadgeProps) {
  if (state.alertLevel === 'none') return null;

  const config = ALERT_CONFIG[state.alertLevel];

  return (
    <div
      className={`flex items-start justify-between rounded-lg border-l-4 p-3 ${
        config.bgColor
      } ${config.borderColor} ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-2">
        <span className="text-base" aria-hidden="true">{config.icon}</span>
        <div>
          <p className={`text-sm font-semibold ${config.textColor}`}>
            Novo lead sem resposta há {state.minutesElapsed} min
          </p>
          <p className={`mt-0.5 text-xs ${config.textColor} opacity-80`}>
            {state.suggestedAction}
          </p>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className={`ml-3 shrink-0 text-sm opacity-60 hover:opacity-100 ${config.textColor}`}
        aria-label="Dispensar alerta"
      >
        ✕
      </button>
    </div>
  );
}
