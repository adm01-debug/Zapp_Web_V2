/**
 * CV-094 — Primeira resposta perfeita.
 *
 * Para contato novo, gera sugestão de abertura que agradece, mostra que
 * entendeu a necessidade e já faz a pergunta B·R·I·N·D·E mais importante.
 * A sugestão é pré-computada no cliente com base nos metadados disponíveis;
 * a versão rica com LLM vem do edge `ai-suggest-reply` (existente).
 */
import { useMemo } from 'react';
import type { BRINDEFields } from './useLeadThermometer';

export interface FirstResponseContext {
  contactName?: string | null;
  /** Primeira mensagem enviada pelo cliente. */
  firstMessage?: string | null;
  /** Campos B·R·I·N·D·E já preenchidos da mensagem inicial. */
  brinde: BRINDEFields;
}

export interface FirstResponseSuggestion {
  /** Mensagem sugerida pronta para uso. */
  text: string;
  /** Qual campo B·R·I·N·D·E a sugestão tenta desbloquear. */
  targetField: keyof BRINDEFields;
  /** Breve motivo da escolha para exibir ao vendedor. */
  rationale: string;
}

const FIELD_PRIORITY: Array<keyof BRINDEFields> = [
  'intention', 'number', 'date', 'budget', 'delivery', 'responsible',
];

function getMissingFields(brinde: BRINDEFields): Array<keyof BRINDEFields> {
  return FIELD_PRIORITY.filter(f => {
    const v = brinde[f];
    return v === null || v === undefined || v === '';
  });
}

const FIELD_QUESTIONS: Record<keyof BRINDEFields, string> = {
  intention: 'Para qual evento ou ação são os brindes?',
  number: 'Quantas unidades vocês precisam aproximadamente?',
  date: 'Para quando precisam estar prontos?',
  budget: 'Já tem uma faixa de investimento por peça em mente?',
  delivery: 'A entrega é em um único endereço? Já têm a logo em vetor?',
  responsible: 'Mais alguém precisa aprovar o orçamento ou a arte?',
};

const FIELD_RATIONALE: Record<keyof BRINDEFields, string> = {
  intention: 'Entender a ocasião define o produto certo.',
  number: 'Quantidade define o preço unitário.',
  date: 'Data do evento define a viabilidade de produção.',
  budget: 'Verba evita orçamentos fora do alcance.',
  delivery: 'Entrega e logo são necessários para fechar.',
  responsible: 'Saber o decisor evita retrabalho na aprovação.',
};

export function useFirstResponseSuggestion(
  ctx: FirstResponseContext,
): FirstResponseSuggestion | null {
  return useMemo(() => {
    const missing = getMissingFields(ctx.brinde);
    if (missing.length === 0) return null;

    const targetField = missing[0];
    const greeting = ctx.contactName ? `Olá, ${ctx.contactName.split(' ')[0]}!` : 'Olá!';
    const question = FIELD_QUESTIONS[targetField];

    const text = `${greeting} Obrigado pelo contato com a Promo Brindes 😊 Vou te ajudar a encontrar a opção ideal. ${question}`;

    return {
      text,
      targetField,
      rationale: FIELD_RATIONALE[targetField],
    };
  }, [ctx.brinde, ctx.contactName]);
}
