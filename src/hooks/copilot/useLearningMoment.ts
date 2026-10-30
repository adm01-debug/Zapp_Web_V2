/**
 * CV-125 — Detecção de momento de aprendizado.
 *
 * Identifica situações na conversa que são oportunidades de aprendizado para
 * o vendedor: objeção nova não coberta pelo battlecard, produto desconhecido
 * mencionado, negociação bem-sucedida que pode virar template.
 * Stub — integração com copilot_insights pendente de CV-012.
 */
import { useMemo } from 'react';

export type LearningMomentType =
  | 'new_objection'
  | 'unknown_product'
  | 'successful_close'
  | 'missed_upsell'
  | 'price_negotiation_won'
  | 'customer_escalation';

export interface LearningMoment {
  type: LearningMomentType;
  description: string;
  /** Sugestão de ação de follow-up para o vendedor ou supervisor. */
  actionSuggestion: string;
  /** Relevância 0–1. */
  relevance: number;
}

const LEARNING_TRIGGERS: Array<{
  type: LearningMomentType;
  patterns: RegExp[];
  description: string;
  action: string;
}> = [
  {
    type: 'new_objection',
    patterns: [/nunca\s+ouvi\s+falar/, /não\s+conheço\s+esse\s+produto/, /que\s+é\s+isso/i],
    description: 'Cliente mencionou produto ou termo desconhecido',
    action: 'Adicione ao glossário de produtos e peça ao supervisor para revisar.',
  },
  {
    type: 'successful_close',
    patterns: [/vou\s+fechar/, /pode\s+emitir/, /fecha\s+o\s+pedido/, /quero\s+comprar/i],
    description: 'Cliente sinalizou fechamento',
    action: 'Salve o roteiro desta conversa como template de sucesso.',
  },
  {
    type: 'missed_upsell',
    patterns: [/só\s+preciso\s+de\s+\d+\s*peça/, /quantidade\s+pequena/, /poucas\s+unidades/i],
    description: 'Oportunidade de upsell de quantidade não aproveitada',
    action: 'Treine a abordagem de faixas de quantidade.',
  },
  {
    type: 'price_negotiation_won',
    patterns: [/aceitou\s+o\s+preço/, /concordou/, /preço\s+aprovado/i],
    description: 'Negociação de preço bem-sucedida',
    action: 'Documente o argumento que funcionou.',
  },
  {
    type: 'customer_escalation',
    patterns: [/quero\s+falar\s+com\s+o\s+responsável/, /chamar\s+o\s+supervisor/i, /escalad/i],
    description: 'Cliente pediu escalação',
    action: 'Revise o motivo da escalação para melhorar o script.',
  },
];

export interface UseLearningMomentOptions {
  /** Conteúdo completo da conversa até agora. */
  conversationText: string;
  /** Se falso, não emite sugestões. */
  enabled?: boolean;
}

export function useLearningMoment({
  conversationText,
  enabled = true,
}: UseLearningMomentOptions): LearningMoment[] {
  return useMemo(() => {
    if (!enabled || !conversationText.trim()) return [];

    const found: LearningMoment[] = [];
    const lower = conversationText.toLowerCase();

    for (const trigger of LEARNING_TRIGGERS) {
      const hits = trigger.patterns.filter((p) => p.test(lower)).length;
      if (hits > 0) {
        found.push({
          type: trigger.type,
          description: trigger.description,
          actionSuggestion: trigger.action,
          relevance: Math.min(hits * 0.4, 1),
        });
      }
    }

    return found.sort((a, b) => b.relevance - a.relevance);
  }, [conversationText, enabled]);
}
