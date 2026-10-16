import { useMemo, useCallback } from 'react';
import type { LeadTemperature } from './useLeadThermometer';

export type FollowUpReason = 'no_response' | 'stale_conversation' | 'cooling_off' | 'post_quote';

export interface FollowUpSuggestion {
  reason: FollowUpReason;
  message: string;         // substantive follow-up (never "e aí?")
  newElement: string;      // what's new: mockup, idea, deadline, proof
  suggestedAt: Date;
  scheduledFor?: Date;
  createsTask: boolean;
}

export interface SilenceAlert {
  conversationId: string;
  daysSilent: number;
  lastTemperature: LeadTemperature;
  estimatedValue?: number;
  priority: 'low' | 'medium' | 'high';
}

export interface UseFollowUpOptions {
  conversationId: string;
  lastClientMessageAt?: Date;
  lastAgentMessageAt?: Date;
  leadTemperature: LeadTemperature;
  estimatedValue?: number;
  brindeContext?: { occasion?: string; eventDate?: Date };
}

// Silence thresholds in hours per temperature
const SILENCE_THRESHOLDS: Record<LeadTemperature, { low: number; medium: number; high: number }> = {
  closing: { low: 2, medium: 4, high: 8 },
  hot:     { low: 6, medium: 24, high: 48 },
  warm:    { low: 12, medium: 48, high: 96 },
  cold:    { low: 24, medium: 72, high: 168 },
};

const NEW_ELEMENTS = [
  'uma ideia de mockup personalizado para o seu evento',
  'um case de sucesso de cliente similar',
  'uma novidade no nosso catálogo que combina com o seu perfil',
  'uma simulação de quanto ficaria com a sua quantidade',
  'uma prova social de resultado com brindes similares',
  'uma proposta especial válida por tempo limitado',
];

function buildFollowUpMessage(
  reason: FollowUpReason,
  element: string,
  brindeContext?: { occasion?: string; eventDate?: Date },
): string {
  const occasion = brindeContext?.occasion ? ` para ${brindeContext.occasion}` : '';
  const deadline = brindeContext?.eventDate
    ? ` — o evento é dia ${brindeContext.eventDate.toLocaleDateString('pt-BR')}`
    : '';

  switch (reason) {
    case 'no_response':
      return `Olá! Preparei ${element}${occasion}${deadline}. Gostaria de compartilhar contigo — posso enviar?`;
    case 'stale_conversation':
      return `Oi! Estava pensando na sua demanda${occasion} e trouxe ${element}${deadline}. Ainda faz sentido para você?`;
    case 'cooling_off':
      return `Oi! Não quero que você perca a oportunidade. Preparei ${element}${occasion}${deadline}. Posso apresentar em 2 minutos?`;
    case 'post_quote':
      return `Oi! Depois do nosso orçamento, preparei ${element}${occasion}${deadline}. Alguma dúvida que eu possa esclarecer?`;
    default:
      return `Olá! Tenho ${element}${occasion} que pode ser útil para você${deadline}. Posso compartilhar?`;
  }
}

function getSilencePriority(
  hoursElapsed: number,
  temperature: LeadTemperature,
): 'low' | 'medium' | 'high' | null {
  const thresholds = SILENCE_THRESHOLDS[temperature];
  if (hoursElapsed >= thresholds.high) return 'high';
  if (hoursElapsed >= thresholds.medium) return 'medium';
  if (hoursElapsed >= thresholds.low) return 'low';
  return null;
}

export function useFollowUp(options: UseFollowUpOptions): {
  followUp: FollowUpSuggestion | null;
  silenceAlert: SilenceAlert | null;
  scheduleFollowUp: (date: Date) => void;
} {
  const {
    conversationId,
    lastClientMessageAt,
    lastAgentMessageAt,
    leadTemperature,
    estimatedValue,
    brindeContext,
  } = options;

  const { followUp, silenceAlert } = useMemo(() => {
    const now = new Date();

    // Determine the relevant timestamp: last client message without agent reply
    const referenceTime = lastClientMessageAt ?? lastAgentMessageAt;
    if (!referenceTime) {
      return { followUp: null, silenceAlert: null };
    }

    // If agent replied after client, check from agent reply (stale conversation)
    const isSilenceFromClient =
      !lastAgentMessageAt ||
      (lastClientMessageAt && lastClientMessageAt > lastAgentMessageAt);

    const msElapsed = now.getTime() - referenceTime.getTime();
    const hoursElapsed = msElapsed / (1000 * 60 * 60);
    const daysElapsed = hoursElapsed / 24;

    const priority = getSilencePriority(hoursElapsed, leadTemperature);

    if (!priority) {
      return { followUp: null, silenceAlert: null };
    }

    const reason: FollowUpReason = isSilenceFromClient
      ? priority === 'high' ? 'cooling_off' : 'no_response'
      : 'stale_conversation';

    // Pick a deterministic element based on conversationId hash
    const elementIndex = conversationId
      .split('')
      .reduce((acc, c) => acc + c.charCodeAt(0), 0) % NEW_ELEMENTS.length;
    const newElement = NEW_ELEMENTS[elementIndex];

    const message = buildFollowUpMessage(reason, newElement, brindeContext);

    const followUpSuggestion: FollowUpSuggestion = {
      reason,
      message,
      newElement,
      suggestedAt: now,
      createsTask: priority === 'high',
    };

    const silenceAlertData: SilenceAlert = {
      conversationId,
      daysSilent: Math.round(daysElapsed * 10) / 10,
      lastTemperature: leadTemperature,
      estimatedValue,
      priority,
    };

    return { followUp: followUpSuggestion, silenceAlert: silenceAlertData };
  }, [conversationId, lastClientMessageAt, lastAgentMessageAt, leadTemperature, estimatedValue, brindeContext]);

  const scheduleFollowUp = useCallback(
    (date: Date) => {
      // In a real implementation, this would create a task/reminder
      // For now it's a no-op placeholder that callers can override
      void date;
    },
    [],
  );

  return { followUp, silenceAlert, scheduleFollowUp };
}
