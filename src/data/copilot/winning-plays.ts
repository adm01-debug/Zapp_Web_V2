/**
 * CV-007 / CV-042 — Biblioteca de plays vencedoras para o copilot RADAR.
 * 12 plays mapeadas por etapa e letra B·R·I·N·D·E.
 */

export type PlayCategory = 'descoberta' | 'ancoragem' | 'urgencia' | 'fechamento' | 'relacionamento' | 'objection';
export type SaleStage = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';
export type BrindeLetter = 'B' | 'R' | 'I' | 'N' | 'D' | 'E';

export interface WinningPlay {
  id: string;
  name: string;
  category: PlayCategory;
  stages: SaleStage[];
  brindeLetter?: BrindeLetter;
  description: string;
  exampleOpener: string;
}

export const WINNING_PLAYS: WinningPlay[] = [
  {
    id: 'descoberta-ocasiao',
    name: 'Descoberta de ocasião',
    category: 'descoberta',
    stages: ['E1', 'E2'],
    brindeLetter: 'I',
    description: 'Identifica o evento/ocasião antes de falar em produto ou preço.',
    exampleOpener: 'Esses brindes são para qual ação? Assim acerto o produto.',
  },
  {
    id: 'descoberta-verba',
    name: 'Descoberta de verba',
    category: 'descoberta',
    stages: ['E2', 'E3'],
    brindeLetter: 'B',
    description: 'Levanta a faixa de investimento sem assustar.',
    exampleOpener: 'Vocês já têm uma faixa de investimento por peça em mente?',
  },
  {
    id: 'descoberta-prazo',
    name: 'Âncora de prazo',
    category: 'descoberta',
    stages: ['E2', 'E3'],
    brindeLetter: 'D',
    description: 'Crava a data antes de qualquer outro detalhe.',
    exampleOpener: 'Para quando vocês precisam deles em mãos?',
  },
  {
    id: 'descoberta-decisor',
    name: 'Identificar o decisor',
    category: 'descoberta',
    stages: ['E2', 'E3'],
    brindeLetter: 'R',
    description: 'Descobre quem aprova antes de mandar orçamento.',
    exampleOpener: 'Além de você, mais alguém precisa aprovar a arte ou o orçamento?',
  },
  {
    id: 'descoberta-quantidade',
    name: 'Âncora de quantidade',
    category: 'descoberta',
    stages: ['E2', 'E3'],
    brindeLetter: 'N',
    description: 'Levanta a quantidade e variações antes de precificar.',
    exampleOpener: 'Quantas unidades vocês estimam? Vai precisar de cores ou tamanhos diferentes?',
  },
  {
    id: 'ancoragem-valor',
    name: 'Ancoragem de valor',
    category: 'ancoragem',
    stages: ['E3', 'E4'],
    description: 'Apresenta o valor em contexto (por unidade × impacto), não como custo isolado.',
    exampleOpener: 'Com 150 peças, fica R$ X por unidade — cada colaborador leva pra casa uma lembrança do evento.',
  },
  {
    id: 'urgencia-data',
    name: 'Urgência pela data',
    category: 'urgencia',
    stages: ['E3', 'E4', 'E5'],
    brindeLetter: 'D',
    description: 'Usa a data do evento como âncora natural de urgência.',
    exampleOpener: 'Para garantir a gravação e chegar antes do evento, o pedido precisa sair até [data].',
  },
  {
    id: 'fechamento-resumo',
    name: 'Fechamento por resumo',
    category: 'fechamento',
    stages: ['E5'],
    description: 'Resume o que foi acordado e pede OK.',
    exampleOpener: 'Então ficou combinado: [produto], [qtd], [data de entrega], [valor]. Posso seguir com o pedido?',
  },
  {
    id: 'fechamento-proximo-passo',
    name: 'Fechamento pelo próximo passo',
    category: 'fechamento',
    stages: ['E4', 'E5'],
    description: 'Propõe o próximo micro-passo em vez do OK final.',
    exampleOpener: 'Consegue me mandar o logo em vetor até amanhã? Com ele gero um mockup no dia.',
  },
  {
    id: 'relacionamento-recorrencia',
    name: 'Memória de compra anterior',
    category: 'relacionamento',
    stages: ['E1', 'E2'],
    description: 'Menciona pedido anterior para criar continuidade.',
    exampleOpener: 'Na SIPAT do ano passado vocês levaram as garrafas — esse ano querem manter ou explorar outra opção?',
  },
  {
    id: 'objection-preco',
    name: 'Reframing de preço',
    category: 'objection',
    stages: ['E4'],
    description: 'Transforma "caro" em análise de custo-benefício.',
    exampleOpener: 'Entendo que parece alto. Por peça é R$ X — tem gravação permanente e serve de lembrança do evento por anos.',
  },
  {
    id: 'objection-prazo',
    name: 'Alternativa de prazo',
    category: 'objection',
    stages: ['E4', 'E5'],
    description: 'Quando prazo impossível com gravação, oferece alternativa.',
    exampleOpener: 'Com esse prazo, gravação a laser não vai dar — mas consigo o mesmo com silk em [prazo menor]. Funciona?',
  },
];

/** Retorna as plays relevantes para o estágio e as letras BRINDE faltando (máx 5). */
export function getRelevantPlays(stage: SaleStage, missingLetters: BrindeLetter[]): WinningPlay[] {
  return WINNING_PLAYS.filter((p) => {
    const stageOk = p.stages.includes(stage);
    const letterOk = !p.brindeLetter || missingLetters.includes(p.brindeLetter);
    return stageOk && letterOk;
  }).slice(0, 5);
}
