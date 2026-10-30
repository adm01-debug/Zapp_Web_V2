/**
 * CV-090 — Escalonamento de urgência.
 *
 * Detecta quando a situação exige escalada de urgência (cliente ameaçando
 * ir para concorrente, reclamação grave, pedido urgente não atendido)
 * e sugere ao vendedor oferecer algo especial para fechar.
 */
import { useMemo } from 'react';

export type EscalationLevel = 'none' | 'high' | 'critical';

export interface UrgencyEscalation {
  level: EscalationLevel;
  reason: string;
  suggestedOffer: string;
  script: string;
}

const HIGH_TRIGGERS = [
  'preciso urgente', 'para amanhã', 'evento amanhã', 'última chance',
  'se não tiver até', 'vou desistir', 'não consigo esperar',
];

const CRITICAL_TRIGGERS = [
  'vou de concorrente', 'já achei outro', 'não preciso mais',
  'insatisfeito', 'reclamação', 'não gostei', 'péssimo atendimento',
];

export interface UseUrgencyEscalationOptions {
  clientMessage: string;
  recentMessages?: string[];
}

export function useUrgencyEscalation({
  clientMessage,
  recentMessages = [],
}: UseUrgencyEscalationOptions): UrgencyEscalation {
  return useMemo(() => {
    const combined = [clientMessage, ...recentMessages].join(' ').toLowerCase();

    if (CRITICAL_TRIGGERS.some((t) => combined.includes(t))) {
      return {
        level: 'critical',
        reason: 'Risco de perda imediata',
        suggestedOffer: 'Ofereça frete grátis + prazo expresso + brinde extra para reter.',
        script: 'Fico muito chateado com isso. Deixa eu fazer algo especial para garantir que você fique satisfeito — posso incluir frete expresso sem custo. Faz sentido?',
      };
    }

    if (HIGH_TRIGGERS.some((t) => combined.includes(t))) {
      return {
        level: 'high',
        reason: 'Urgência declarada',
        suggestedOffer: 'Verifique possibilidade de produção expressa ou estoque imediato.',
        script: 'Vou verificar agora nossa fila de produção para ver se consigo encaixar seu pedido com prioridade. Um momento?',
      };
    }

    return { level: 'none', reason: '', suggestedOffer: '', script: '' };
  }, [clientMessage, recentMessages]);
}
