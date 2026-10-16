/**
 * CV-033 — Biblioteca de perguntas para letras B·R·I·N·D·E ausentes.
 * Perguntas escolhidas por etapa de venda, naturais para o contexto.
 * Cada letra tem múltiplas variantes; o componente escolhe pela etapa atual.
 */

export type BrindeLetter = 'B' | 'R' | 'I' | 'N' | 'D' | 'E';
export type SaleStage = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';

export interface BrindeQuestion {
  letter: BrindeLetter;
  stage: SaleStage[];
  text: string;
  label: string;
}

export const BRINDE_QUESTIONS: BrindeQuestion[] = [
  // B — Budget / Orçamento
  { letter: 'B', stage: ['E1','E2'], label: 'Orçamento', text: 'Qual é a faixa de investimento que vocês têm em mente para este brinde?' },
  { letter: 'B', stage: ['E3','E4'], label: 'Orçamento', text: 'Já temos uma ideia do budget aprovado para este projeto?' },
  { letter: 'B', stage: ['E5','E6'], label: 'Orçamento', text: 'O valor que apresentamos está dentro do que foi aprovado?' },

  // R — Responsável / Decisor
  { letter: 'R', stage: ['E1','E2'], label: 'Decisor', text: 'Quem da empresa vai acompanhar a aprovação deste pedido?' },
  { letter: 'R', stage: ['E3','E4'], label: 'Decisor', text: 'A aprovação fica com você ou precisa passar por mais alguém?' },
  { letter: 'R', stage: ['E5','E6'], label: 'Decisor', text: 'Para agilizar o fechamento, quem assina a aprovação final?' },

  // I — Intenção de compra
  { letter: 'I', stage: ['E1','E2'], label: 'Intenção', text: 'Para qual ocasião vocês estão pensando neste brinde?' },
  { letter: 'I', stage: ['E3','E4'], label: 'Intenção', text: 'A ideia é usar para um evento específico ou distribuição contínua?' },

  // N — Número / Quantidade
  { letter: 'N', stage: ['E1','E2'], label: 'Quantidade', text: 'Quantas peças vocês precisam aproximadamente?' },
  { letter: 'N', stage: ['E3','E4'], label: 'Quantidade', text: 'Já tem uma quantidade definida ou ainda está em aberto?' },
  { letter: 'N', stage: ['E5','E6'], label: 'Quantidade', text: 'Confirmamos a quantidade final: continua sendo a mesma?' },

  // D — Data de necessidade
  { letter: 'D', stage: ['E1','E2'], label: 'Prazo', text: 'Quando vocês precisam receber o material?' },
  { letter: 'D', stage: ['E3','E4'], label: 'Prazo', text: 'Qual é a data-limite para a entrega?' },
  { letter: 'D', stage: ['E5','E6'], label: 'Prazo', text: 'Só confirmando: a data de entrega ainda é a mesma?' },

  // E — Entrega / Local
  { letter: 'E', stage: ['E1','E2'], label: 'Entrega', text: 'Para qual endereço será a entrega?' },
  { letter: 'E', stage: ['E3','E4'], label: 'Entrega', text: 'A entrega é em um endereço só ou em múltiplos pontos?' },
  { letter: 'E', stage: ['E5','E6'], label: 'Entrega', text: 'Confirma o endereço de entrega para fecharmos o pedido?' },
];

/** Retorna a melhor pergunta para uma letra numa etapa. */
export function getBrindeQuestion(letter: BrindeLetter, stage: SaleStage): BrindeQuestion | undefined {
  const match = BRINDE_QUESTIONS.filter(q => q.letter === letter && q.stage.includes(stage));
  return match[0];
}

/** Retorna as letras ausentes (null) no estado. */
export function getMissingLetters(
  state: Record<BrindeLetter, string | null>,
): BrindeLetter[] {
  return (Object.keys(state) as BrindeLetter[]).filter(l => !state[l]);
}
