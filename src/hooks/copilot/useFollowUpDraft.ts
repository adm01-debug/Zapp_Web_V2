/**
 * CV-096 — Follow-up que não é "e aí?".
 *
 * Gera mensagens de retomada que trazem algo novo (mockup, ideia, prazo,
 * prova social), nunca só cobrança. Validador rejeita follow-up sem
 * elemento novo.
 */
import { useMemo } from 'react';
import type { BRINDEFields } from './useLeadThermometer';

export type FollowUpElementType =
  | 'mockup'
  | 'deadline_alert'
  | 'new_product'
  | 'social_proof'
  | 'price_drop'
  | 'custom';

export interface FollowUpDraft {
  text: string;
  elementType: FollowUpElementType;
  hasNewElement: boolean;
}

export interface UseFollowUpDraftOptions {
  contactName?: string | null;
  brinde: BRINDEFields;
  /** Dias restantes até o prazo reverso (null = desconhecido). */
  daysUntilDeadline?: number | null;
  /** Se existe mockup gerado para este cliente. */
  hasMockup?: boolean;
  /** Custom element to include (overrides auto selection). */
  customElement?: string | null;
}

const GENERIC_PHRASES = ['e aí', 'viu', 'viu minha mensagem', 'já viu', 'alguma novidade', 'conseguiu ver'];

function isGeneric(text: string): boolean {
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.some(p => lower.includes(p));
}

export function useFollowUpDraft(options: UseFollowUpDraftOptions): FollowUpDraft {
  const { contactName, brinde, daysUntilDeadline, hasMockup, customElement } = options;

  return useMemo(() => {
    const name = contactName ? contactName.split(' ')[0] : null;
    const greeting = name ? `Olá, ${name}!` : 'Olá!';

    if (customElement) {
      const text = `${greeting} ${customElement}`;
      return { text, elementType: 'custom', hasNewElement: !isGeneric(text) };
    }

    if (hasMockup) {
      const text = `${greeting} Preparei uma simulação de mockup para vocês — quero que vejam como ficaria antes de qualquer compromisso. Posso enviar?`;
      return { text, elementType: 'mockup', hasNewElement: true };
    }

    if (daysUntilDeadline !== null && daysUntilDeadline !== undefined && daysUntilDeadline <= 5) {
      const text = `${greeting} Queria só avisar que, para garantir entrega${brinde.date ? ` até ${brinde.date}` : ''}, o prazo de produção fecha nos próximos dias. Ainda dá tempo se confirmarmos hoje. Como está a decisão?`;
      return { text, elementType: 'deadline_alert', hasNewElement: true };
    }

    if (brinde.intention) {
      const text = `${greeting} Acabamos de receber novos produtos perfeitos para ${brinde.intention}. Quer que eu separe as opções que mais combinam com a proposta de vocês?`;
      return { text, elementType: 'new_product', hasNewElement: true };
    }

    const text = `${greeting} Tivemos um cliente no mesmo segmento que ficou muito satisfeito com o resultado. Se quiser, compartilho o case — pode ajudar na decisão. Como posso continuar te ajudando?`;
    return { text, elementType: 'social_proof', hasNewElement: true };
  }, [contactName, brinde, daysUntilDeadline, hasMockup, customElement]);
}

/** Valida se um texto de follow-up contém elemento novo (não é "e aí?"). */
export function validateFollowUp(text: string): { valid: boolean; reason?: string } {
  if (isGeneric(text)) {
    return { valid: false, reason: 'Follow-up sem elemento novo. Adicione uma oferta, prazo, mockup ou prova social.' };
  }
  if (text.trim().length < 30) {
    return { valid: false, reason: 'Mensagem muito curta para um follow-up eficaz.' };
  }
  return { valid: true };
}
