/**
 * Dicionários de rótulo pt-BR para os valores canônicos do banco do Singu
 * (Perfil Singu do sidebar do contato). Copiados de Singu_V2
 * (`src/types/index.ts`, `src/types/enneagram.ts`, `src/types/temperament.ts`,
 * `src/types/vak.ts`, `src/types/metaprograms.ts`).
 *
 * Regra de ouro: valor fora do dicionário devolve o valor cru — nunca quebra.
 */

export const DISC_LABELS: Record<string, { name: string; description: string }> = {
  D: { name: 'Dominante', description: 'Direto, decisivo, focado em resultados' },
  I: { name: 'Influente', description: 'Entusiasta, otimista, focado em pessoas' },
  S: { name: 'Estável', description: 'Paciente, confiável, focado em segurança' },
  C: { name: 'Conforme', description: 'Analítico, preciso, focado em qualidade' },
};

/** Cobre os três formatos do Singu: letra ('V'), inglês ('visual') e pt ('auditivo'). */
export const VAK_LABELS: Record<string, string> = {
  V: 'Visual',
  A: 'Auditivo',
  K: 'Cinestésico',
  D: 'Digital',
  visual: 'Visual',
  auditory: 'Auditivo',
  auditivo: 'Auditivo',
  kinesthetic: 'Cinestésico',
  cinestesico: 'Cinestésico',
  digital: 'Digital',
};

export const MBTI_LABELS: Record<string, string> = {
  INTJ: 'O Arquiteto',
  INTP: 'O Lógico',
  ENTJ: 'O Comandante',
  ENTP: 'O Inovador',
  INFJ: 'O Advogado',
  INFP: 'O Mediador',
  ENFJ: 'O Protagonista',
  ENFP: 'O Ativista',
  ISTJ: 'O Logístico',
  ISFJ: 'O Defensor',
  ESTJ: 'O Executivo',
  ESFJ: 'O Cônsul',
  ISTP: 'O Virtuoso',
  ISFP: 'O Aventureiro',
  ESTP: 'O Empresário',
  ESFP: 'O Animador',
};

export const ENNEAGRAM_LABELS: Record<number, string> = {
  1: 'O Perfeccionista',
  2: 'O Ajudador',
  3: 'O Realizador',
  4: 'O Individualista',
  5: 'O Investigador',
  6: 'O Lealista',
  7: 'O Entusiasta',
  8: 'O Desafiador',
  9: 'O Pacificador',
};

/** Cobre inglês (canonical do Singu) e pt-BR já gravado. */
export const TEMPERAMENT_LABELS: Record<string, string> = {
  sanguine: 'Sanguíneo',
  choleric: 'Colérico',
  melancholic: 'Melancólico',
  phlegmatic: 'Fleumático',
  sanguineo: 'Sanguíneo',
  colerico: 'Colérico',
  melancolico: 'Melancólico',
  fleumatico: 'Fleumático',
};

export const BIG_FIVE_LABELS: Record<string, string> = {
  openness: 'Abertura',
  conscientiousness: 'Conscienciosidade',
  extraversion: 'Extroversão',
  agreeableness: 'Amabilidade',
  neuroticism: 'Neuroticismo',
};

/** `contact_decision_making.budget_authority` (texto livre no Singu) → rótulo. */
export const BUDGET_AUTHORITY_LABELS: Record<string, string> = {
  yes: 'Aprovador final',
  aprovador_final: 'Aprovador final',
  no: 'Precisa de aprovação',
  precisa_aprovacao: 'Precisa de aprovação',
  needs_approval: 'Precisa de aprovação',
  shared: 'Decisão compartilhada',
  compartilhada: 'Decisão compartilhada',
  influencer: 'Influenciador',
  influenciador: 'Influenciador',
};

export const DECISION_ROLE_LABELS: Record<string, string> = {
  final_decision: 'Decisor Final',
  technical: 'Influenciador Técnico',
  economic: 'Influenciador Econômico',
  user: 'Usuário Final',
  blocker: 'Bloqueador',
  champion: 'Defensor Interno',
};

export const DECISION_SPEED_LABELS: Record<string, string> = {
  impulsive: 'Impulsivo',
  fast: 'Rápido',
  moderate: 'Moderado',
  slow: 'Lento',
};

export const DECISION_CRITERIA_LABELS: Record<string, string> = {
  price: 'Preço',
  quality: 'Qualidade',
  relationship: 'Relacionamento',
  speed: 'Velocidade',
  support: 'Suporte',
  innovation: 'Inovação',
  reputation: 'Reputação',
  referral: 'Indicação',
};

/** Rótulo do DISC para o tile: "D Dominante" (+ blend quando houver). */
export function discLabel(value: string | null | undefined, blend?: string | null): string | null {
  if (!value) return null;
  const nome = DISC_LABELS[value]?.name;
  const base = nome ? `${value} ${nome}` : value;
  return blend ? `${base} (${blend})` : base;
}

/** Devolve o rótulo do dicionário ou o valor cru quando desconhecido/vazio. */
export function labelOrRaw(labels: Record<string, string>, value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  return labels[value] ?? value;
}

/** Nome pt-BR do tipo de Eneagrama, ex.: "Tipo 3 – O Realizador". */
export function enneagramLabel(type: number | null | undefined, wing?: number | null): string | null {
  if (type === null || type === undefined) return null;
  const nome = ENNEAGRAM_LABELS[type];
  const base = nome ? `Tipo ${type} – ${nome}` : `Tipo ${type}`;
  return wing !== null && wing !== undefined ? `${base} (asa ${wing})` : base;
}

export interface MetaprogramScores {
  toward?: number | null;
  away_from?: number | null;
  internal?: number | null;
  external?: number | null;
  options?: number | null;
  procedures?: number | null;
  proactive?: number | null;
  reactive?: number | null;
  global?: number | null;
  detail?: number | null;
}

const METAPROGRAM_AXES: Array<{
  a: keyof MetaprogramScores;
  b: keyof MetaprogramScores;
  aReading: string;
  bReading: string;
}> = [
  { a: 'toward', b: 'away_from', aReading: 'Foco em resultados', bReading: 'Foco em evitar problemas' },
  { a: 'internal', b: 'external', aReading: 'Referência interna', bReading: 'Referência externa' },
  { a: 'options', b: 'procedures', aReading: 'Busca opções', bReading: 'Segue procedimentos' },
  { a: 'proactive', b: 'reactive', aReading: 'Pró-ativo', bReading: 'Reativo' },
  { a: 'global', b: 'detail', aReading: 'Visão global', bReading: 'Detalhista' },
];

/**
 * Resume os 10 scores de metaprogramas em até 2 leituras de 1 linha
 * (ex.: "Foco em resultados, pró-ativo"). Empate ou eixo sem dados não emite
 * leitura; sem nenhuma leitura retorna null.
 */
export function summarizeMetaprograms(scores: MetaprogramScores | null | undefined): string | null {
  if (!scores) return null;
  const readings: string[] = [];
  for (const axis of METAPROGRAM_AXES) {
    const a = scores[axis.a];
    const b = scores[axis.b];
    if (typeof a === 'number' && typeof b === 'number') {
      if (a > b) readings.push(axis.aReading);
      else if (b > a) readings.push(axis.bReading);
    } else if (typeof a === 'number') {
      readings.push(axis.aReading);
    } else if (typeof b === 'number') {
      readings.push(axis.bReading);
    }
    if (readings.length >= 2) break;
  }
  return readings.length > 0 ? readings.join(', ') : null;
}
