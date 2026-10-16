/**
 * Saúde do relacionamento com o contato (fase K do plano, etapa K05).
 *
 * Módulo PURO: recebe o instante do último contato e a lista de instantes recentes e devolve a
 * faixa, o texto e a cor do chip. Nenhuma consulta, nenhum Supabase, nenhum componente.
 *
 * Faixas (do cartão, em dias inteiros desde o último contato):
 *   ≤ 3  = Ativo    (success)
 *   4–14 = Morno    (info)
 *   15–30 = Esfriando (warning)
 *   > 30 = Inativo  (muted)
 *
 * A **frequência recente** não muda a faixa (a faixa é do último contato): ela entra na dica do
 * chip, dizendo quantas interações houve nos últimos `HEALTH_RECENT_WINDOW_DAYS` dias — é o que
 * dá contexto a "Esfriando" (parou de responder ou sempre falou pouco?).
 *
 * Cores: só os tons que o sistema já tem (success/info/warning/muted); o chip traduz o tom em
 * classes de token, nunca em cor literal.
 */

const DIA_MS = 86_400_000;

/** Até este número de dias o relacionamento está Ativo. */
export const HEALTH_ACTIVE_MAX_DAYS = 3;
/** Até este número de dias está Morno. */
export const HEALTH_WARM_MAX_DAYS = 14;
/** Até este número de dias está Esfriando; acima disso, Inativo. */
export const HEALTH_COOLING_MAX_DAYS = 30;
/** Janela da "frequência recente" mostrada na dica do chip. */
export const HEALTH_RECENT_WINDOW_DAYS = 30;

export type JourneyHealthLevel = 'active' | 'warm' | 'cooling' | 'inactive';

/** Tom do chip — mesmos tons do `PILL_CLASS` da aba. */
export type JourneyHealthTone = 'success' | 'info' | 'warning' | 'muted';

export interface JourneyHealth {
  level: JourneyHealthLevel;
  /** 'Ativo' | 'Morno' | 'Esfriando' | 'Inativo'. */
  label: string;
  tone: JourneyHealthTone;
  /** Dias inteiros desde o último contato; `null` quando não há contato para medir. */
  daysSinceContact: number | null;
  /** Interações dentro de `HEALTH_RECENT_WINDOW_DAYS` dias. */
  recentCount: number;
  /** Texto do chip: `Esfriando: 12 dias sem contato`. */
  headline: string;
  /** Dica do chip (o `title`): explica a régua das faixas. */
  rule: string;
}

export interface JourneyHealthInput {
  /** Instante ISO do último contato (todo o histórico). */
  lastInteractionAt?: string | null;
  /** Instantes ISO das interações recentes, para a frequência da dica. */
  recentInteractions?: readonly (string | null | undefined)[] | null;
}

const LABELS: Record<JourneyHealthLevel, string> = {
  active: 'Ativo',
  warm: 'Morno',
  cooling: 'Esfriando',
  inactive: 'Inativo',
};

const TONES: Record<JourneyHealthLevel, JourneyHealthTone> = {
  active: 'success',
  warm: 'info',
  cooling: 'warning',
  inactive: 'muted',
};

/** A regra escrita uma vez só: é a mesma dica para toda faixa. */
export const HEALTH_RULE =
  'Regra: último contato até 3 dias = Ativo · 4 a 14 dias = Morno · 15 a 30 dias = Esfriando · mais de 30 dias = Inativo.';

/** Carimbo de data; ausente ou ilegível → `null` (a linha é ignorada). */
function instantOf(value: string | null | undefined): number | null {
  if (typeof value !== 'string') return null;
  const texto = value.trim();
  if (texto.length === 0) return null;
  const ms = Date.parse(texto);
  return Number.isFinite(ms) ? ms : null;
}

function levelOf(days: number): JourneyHealthLevel {
  if (days <= HEALTH_ACTIVE_MAX_DAYS) return 'active';
  if (days <= HEALTH_WARM_MAX_DAYS) return 'warm';
  if (days <= HEALTH_COOLING_MAX_DAYS) return 'cooling';
  return 'inactive';
}

function headlineOf(label: string, days: number | null): string {
  if (days === null) return 'Sem contato registrado';
  if (days === 0) return `${label}: contato hoje`;
  return `${label}: ${days} ${days === 1 ? 'dia' : 'dias'} sem contato`;
}

/**
 * Classifica a saúde do relacionamento.
 *
 * @param input o último contato e (opcionalmente) as interações recentes.
 * @param now   relógio de referência; por padrão, agora.
 */
export function classifyJourneyHealth(input: JourneyHealthInput, now: Date = new Date()): JourneyHealth {
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const lastMs = instantOf(input?.lastInteractionAt);

  const janelaInicio = nowMs - HEALTH_RECENT_WINDOW_DAYS * DIA_MS;
  const recentCount = (input?.recentInteractions ?? [])
    .map((valor) => instantOf(valor))
    .filter((ms): ms is number => ms !== null && ms >= janelaInicio && ms <= nowMs).length;

  if (lastMs === null) {
    return {
      level: 'inactive',
      label: LABELS.inactive,
      tone: TONES.inactive,
      daysSinceContact: null,
      recentCount,
      headline: headlineOf(LABELS.inactive, null),
      rule: HEALTH_RULE,
    };
  }

  // Carimbo no futuro (relógio do cliente atrás do servidor) não vira dias negativos.
  const days = Math.max(0, Math.floor((nowMs - lastMs) / DIA_MS));
  const level = levelOf(days);

  return {
    level,
    label: LABELS[level],
    tone: TONES[level],
    daysSinceContact: days,
    recentCount,
    headline: headlineOf(LABELS[level], days),
    rule: HEALTH_RULE,
  };
}
