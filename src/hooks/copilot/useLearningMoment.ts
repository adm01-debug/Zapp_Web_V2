/**
 * CV-125 — Detecção de momento de aprendizado (stub).
 */
import { useMemo } from 'react';

export type LearningMomentType = 'new_objection' | 'unknown_product' | 'successful_close' | 'missed_upsell' | 'price_negotiation_won' | 'customer_escalation';

export interface LearningMoment {
  type: LearningMomentType;
  description: string;
  actionSuggestion: string;
  relevance: number;
}

const LEARNING_TRIGGERS: Array<{ type: LearningMomentType; patterns: RegExp[]; description: string; action: string }> = [
  { type: 'new_objection', patterns: [/nunca\s+ouvi\s+falar/, /não\s+conheço\s+esse\s+produto/, /que\s+é\s+isso/i], description: 'Cliente mencionou produto ou termo desconhecido', action: 'Adicione ao glossário de produtos e peça ao supervisor para revisar.' },
  { type: 'successful_close', patterns: [/vou\s+fechar/, /pode\s+emitir/, /fecha\s+o\s+pedido/, /quero\s+comprar/i], description: 'Cliente sinalizou fechamento', action: 'Salve o roteiro desta conversa como template de sucesso.' },
  { type: 'missed_upsell', patterns: [/só\s+preciso\s+de\s+\d+\s*peça/, /quantidade\s+pequena/, /poucas\s+unidades/i], description: 'Oportunidade de upsell de quantidade não aproveitada', action: 'Treine a abordagem de faixas de quantidade.' },
  { type: 'price_negotiation_won', patterns: [/aceitou\s+o\s+preço/, /concordou/, /preço\s+aprovado/i], description: 'Negociação de preço bem-sucedida', action: 'Documente o argumento que funcionou.' },
  { type: 'customer_escalation', patterns: [/quero\s+falar\s+com\s+o\s+responsável/, /chamar\s+o\s+supervisor/i, /escalad/i], description: 'Cliente pediu escalação', action: 'Revise o motivo da escalação para melhorar o script.' },
];

export function useLearningMoment({ conversationText, enabled = true }: { conversationText: string; enabled?: boolean }): LearningMoment[] {
  return useMemo(() => {
    if (!enabled || !conversationText.trim()) return [];
    const lower = conversationText.toLowerCase();
    return LEARNING_TRIGGERS
      .filter((t) => t.patterns.some((p) => p.test(lower)))
      .map((t) => ({ type: t.type, description: t.description, actionSuggestion: t.action, relevance: Math.min(t.patterns.filter((p) => p.test(lower)).length * 0.4, 1) }))
      .sort((a, b) => b.relevance - a.relevance);
  }, [conversationText, enabled]);
}
