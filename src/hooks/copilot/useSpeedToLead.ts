/**
 * CV-093 — Speed-to-lead.
 *
 * Monitora o tempo desde a primeira mensagem do cliente e alerta
 * quando o vendedor está demorando demais para responder (lead esfriando).
 */
import { useMemo } from 'react';

export type ResponseUrgency = 'ok' | 'slow' | 'critical';

export interface SpeedToLeadResult {
  minutesWaiting: number;
  urgency: ResponseUrgency;
  alertMessage: string;
  actionHint: string;
}

const THRESHOLDS = {
  slow: 5,
  critical: 30,
};

export interface UseSpeedToLeadOptions {
  firstClientMessageAt?: Date | string | null;
  lastAgentMessageAt?: Date | string | null;
  /** Current timestamp in ms; pass Date.now() from the caller. */
  now?: number;
}

export function useSpeedToLead({
  firstClientMessageAt,
  lastAgentMessageAt,
  now,
}: UseSpeedToLeadOptions): SpeedToLeadResult | null {
  return useMemo(() => {
    if (!firstClientMessageAt) return null;

    const firstMsgTime = new Date(firstClientMessageAt).getTime();
    const currentTime = now ?? 0;

    if (lastAgentMessageAt) {
      const lastAgentTime = new Date(lastAgentMessageAt).getTime();
      if (lastAgentTime > firstMsgTime) return null;
    }

    const minutesWaiting = Math.floor((currentTime - firstMsgTime) / 60000);

    if (minutesWaiting < THRESHOLDS.slow) {
      return {
        minutesWaiting,
        urgency: 'ok',
        alertMessage: '',
        actionHint: 'Dentro do tempo ideal',
      };
    }

    if (minutesWaiting >= THRESHOLDS.critical) {
      return {
        minutesWaiting,
        urgency: 'critical',
        alertMessage: `⚠️ ${minutesWaiting} min sem resposta — lead esfriando!`,
        actionHint: 'Responda agora com a mensagem de abertura padrão',
      };
    }

    return {
      minutesWaiting,
      urgency: 'slow',
      alertMessage: `${minutesWaiting} min esperando resposta`,
      actionHint: 'Envie uma saudação rápida para manter o lead quente',
    };
  }, [firstClientMessageAt, lastAgentMessageAt, now]);
}
