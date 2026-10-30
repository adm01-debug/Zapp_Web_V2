/**
 * CV-033 — Biblioteca de perguntas para letras B·R·I·N·D·E ausentes.
 * Perguntas escolhidas pela fase da venda (início/meio/fim, ver sale-stages.ts), naturais para o contexto.
 * Cada letra tem múltiplas variantes; o componente escolhe pela etapa atual.
 */

export type BrindeLetter = 'B' | 'R' | 'I' | 'N' | 'D' | 'E';
import { SALE_STAGE_META, type FaseVenda, type SaleStage } from './sale-stages';

export type { SaleStage };

export interface BrindeQuestion {
  letter: BrindeLetter;
  fase: FaseVenda;
  text: string;
  label: string;
}

export const BRINDE_QUESTIONS: BrindeQuestion[] = [
  // B — Budget / Orçamento
  { letter: 'B', fase: 'inicio', label: 'Orçamento', text: 'Qual é a faixa de investimento que vocês têm em mente para este brinde?' },
  { letter: 'B', fase: 'meio', label: 'Orçamento', text: 'Já temos uma ideia do budget aprovado para este projeto?' },
  { letter: 'B', fase: 'fim', label: 'Orçamento', text: 'O valor que apresentamos está dentro do que foi aprovado?' },

  // R — Responsável / Decisor
  { letter: 'R', fase: 'inicio', label: 'Decisor', text: 'Quem da empresa vai acompanhar a aprovação deste pedido?' },
  { letter: 'R', fase: 'meio', label: 'Decisor', text: 'A aprovação fica com você ou precisa passar por mais alguém?' },
  { letter: 'R', fase: 'fim', label: 'Decisor', text: 'Para agilizar o fechamento, quem assina a aprovação final?' },

  // I — Intenção de compra
  { letter: 'I', fase: 'inicio', label: 'Intenção', text: 'Para qual ocasião vocês estão pensando neste brinde?' },
  { letter: 'I', fase: 'meio', label: 'Intenção', text: 'A ideia é usar para um evento específico ou distribuição contínua?' },

  // N — Número / Quantidade
  { letter: 'N', fase: 'inicio', label: 'Quantidade', text: 'Quantas peças vocês precisam aproximadamente?' },
  { letter: 'N', fase: 'meio', label: 'Quantidade', text: 'Já tem uma quantidade definida ou ainda está em aberto?' },
  { letter: 'N', fase: 'fim', label: 'Quantidade', text: 'Confirmamos a quantidade final: continua sendo a mesma?' },

  // D — Data de necessidade
  { letter: 'D', fase: 'inicio', label: 'Prazo', text: 'Quando vocês precisam receber o material?' },
  { letter: 'D', fase: 'meio', label: 'Prazo', text: 'Qual é a data-limite para a entrega?' },
  { letter: 'D', fase: 'fim', label: 'Prazo', text: 'Só confirmando: a data de entrega ainda é a mesma?' },

  // E — Entrega / Local
  { letter: 'E', fase: 'inicio', label: 'Entrega', text: 'Para qual endereço será a entrega?' },
  { letter: 'E', fase: 'meio', label: 'Entrega', text: 'A entrega é em um endereço só ou em múltiplos pontos?' },
  { letter: 'E', fase: 'fim', label: 'Entrega', text: 'Confirma o endereço de entrega para fecharmos o pedido?' },
];

/** Retorna a melhor pergunta para uma letra numa etapa. */
export function getBrindeQuestion(letter: BrindeLetter, stage: SaleStage): BrindeQuestion | undefined {
  const fase = SALE_STAGE_META[stage].fase;
  return BRINDE_QUESTIONS.find(q => q.letter === letter && q.fase === fase)
    ?? BRINDE_QUESTIONS.find(q => q.letter === letter);
}

/** Retorna as letras ausentes (null) no estado. */
export function getMissingLetters(
  state: Record<BrindeLetter, string | null>,
): BrindeLetter[] {
  return (Object.keys(state) as BrindeLetter[]).filter(l => !state[l]);
}
