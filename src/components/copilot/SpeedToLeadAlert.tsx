import React from 'react';
import type { SpeedToLeadState, SpeedToLeadLevel } from '@/hooks/copilot/useSpeedToLead';

export interface SpeedToLeadAlertProps {
  state: SpeedToLeadState;
  onDismiss: () => void;
  className?: string;
}

const LEVEL_STYLES: Record<SpeedToLeadLevel, { border: string; bg: string; text: string; icon: string }> = {
  ok: { border: 'border-gray-200', bg: 'bg-gray-50', text: 'text-gray-600', icon: '⏱️' },
  warning: { border: 'border-yellow-400', bg: 'bg-yellow-50', text: 'text-yellow-800', icon: '⚠️' },
  critical: { border: 'border-red-500', bg: 'bg-red-50', text: 'text-red-800', icon: '🚨' },
};

export function SpeedToLeadAlert({ state, onDismiss, className = '' }: SpeedToLeadAlertProps) {
  if (state.level === 'ok') return null;
  if (state.dismissedAt !== null) return null;

  const styles = LEVEL_STYLES[state.level];
  const minutes = Math.round(state.elapsedMinutes);

  return (
    <div
      className={`rounded-lg border-2 p-3 shadow-sm ${styles.border} ${styles.bg} ${className}`}
      role="alert"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">{styles.icon}</span>
          <div>
            <p className={`text-xs font-semibold ${styles.text}`}>
              {state.level === 'critical'
                ? `Lead sem resposta há ${minutes} min — escalar para supervisor`
                : `Lead aguardando há ${minutes} min — responda agora`}
            </p>
            {state.shouldEscalate && (
              <p className="mt-0.5 text-[10px] text-red-600">
                Contato em até 5 min aumenta 21× a chance de qualificação.
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className={`ml-2 shrink-0 hover:opacity-70 ${styles.text}`}
          aria-label="Dispensar alerta"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
