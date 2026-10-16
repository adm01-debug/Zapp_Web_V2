import { useMemo, useState, useCallback } from 'react';

export type AlertLevel = 'none' | 'vendor_2min' | 'vendor_5min' | 'supervisor';

export interface SpeedToLeadState {
  conversationId: string;
  isNewLead: boolean;
  unansweredSince?: Date;
  alertLevel: AlertLevel;
  minutesElapsed: number;
  suggestedAction: string;
}

export interface UseSpeedToLeadOptions {
  conversationId: string;
  isNewLead: boolean;
  lastMessageAt?: Date;
  lastAgentReplyAt?: Date;
  onAlert?: (level: AlertLevel, state: SpeedToLeadState) => void;
}

function computeAlertLevel(minutesElapsed: number): AlertLevel {
  if (minutesElapsed >= 10) return 'supervisor';
  if (minutesElapsed >= 5) return 'vendor_5min';
  if (minutesElapsed >= 2) return 'vendor_2min';
  return 'none';
}

function suggestedActionFor(level: AlertLevel, minutesElapsed: number): string {
  switch (level) {
    case 'vendor_2min':
      return `Novo lead sem resposta há ${minutesElapsed} min — responda agora para aumentar a chance de conversão.`;
    case 'vendor_5min':
      return `Atenção: lead esperando há ${minutesElapsed} min. Responda imediatamente — leads sem resposta em 5 min têm 80% menos chance de converter.`;
    case 'supervisor':
      return `URGENTE: lead novo sem resposta há ${minutesElapsed} min. Escalar para supervisor.`;
    default:
      return '';
  }
}

export function useSpeedToLead(options: UseSpeedToLeadOptions): {
  state: SpeedToLeadState;
  dismiss: () => void;
} {
  const { conversationId, isNewLead, lastMessageAt, lastAgentReplyAt, onAlert } = options;
  const [dismissed, setDismissed] = useState(false);

  const state = useMemo((): SpeedToLeadState => {
    // Only applies to new leads
    if (!isNewLead || dismissed) {
      return {
        conversationId,
        isNewLead,
        alertLevel: 'none',
        minutesElapsed: 0,
        suggestedAction: '',
      };
    }

    if (!lastMessageAt) {
      return {
        conversationId,
        isNewLead,
        alertLevel: 'none',
        minutesElapsed: 0,
        suggestedAction: '',
      };
    }

    // If agent already replied after client message, no alert
    if (lastAgentReplyAt && lastAgentReplyAt >= lastMessageAt) {
      return {
        conversationId,
        isNewLead,
        alertLevel: 'none',
        minutesElapsed: 0,
        suggestedAction: '',
      };
    }

    const now = new Date();
    const msElapsed = now.getTime() - lastMessageAt.getTime();
    const minutesElapsed = Math.floor(msElapsed / 60_000);
    const alertLevel = computeAlertLevel(minutesElapsed);
    const suggestedAction = suggestedActionFor(alertLevel, minutesElapsed);

    return {
      conversationId,
      isNewLead,
      unansweredSince: lastMessageAt,
      alertLevel,
      minutesElapsed,
      suggestedAction,
    };
  }, [conversationId, isNewLead, lastMessageAt, lastAgentReplyAt, dismissed]);

  // Fire callback when alert level changes (tracked via useMemo side-effect alternative)
  useMemo(() => {
    if (state.alertLevel !== 'none') {
      onAlert?.(state.alertLevel, state);
    }
  }, [state.alertLevel]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return { state, dismiss };
}
