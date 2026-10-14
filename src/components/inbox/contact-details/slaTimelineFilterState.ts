/**
 * Estado dos filtros da "Linha do tempo de SLA" — seleção do usuário e memória.
 *
 * A tela guarda a seleção (período, tipos e situações) e precisa lembrá-la na
 * próxima abertura do painel. Isso é só preferência de tela: mora no
 * `localStorage` do navegador, nunca no banco e nunca sai do aparelho. Aqui a
 * leitura/escrita é sempre protegida — `localStorage` pode estar bloqueado
 * (modo privado, cota cheia, storage desabilitado) e a tela não pode quebrar por
 * causa de uma preferência.
 *
 * Separar a seleção da tela do contrato de `filterSlaMilestones` permite provar
 * a memória e o atalho "Só em risco/estourado" sem renderizar nada.
 */
import type {
  SlaMilestoneKind,
  SlaTimelineFilters,
  SlaTimelinePeriod,
  SlaTimelineStatus,
} from '@/lib/slaTimeline';

/** Situações que o atalho "Só em risco/estourado" liga de uma vez. */
export const SLA_RISK_STATUSES: readonly SlaTimelineStatus[] = ['warning', 'breached'];

export const SLA_TIMELINE_FILTERS_STORAGE_KEY = 'sla-timeline-filters@v1';

const PERIODS: readonly SlaTimelinePeriod[] = ['24h', '7d', '30d', 'all'];
const KINDS: readonly SlaMilestoneKind[] = ['opened', 'first_response', 'resolution', 'transfer', 'closed_no_response'];
const STATUSES: readonly SlaTimelineStatus[] = ['ok', 'warning', 'breached', 'na'];

/** Seleção concreta da tela: lista vazia significa "nenhum corte" (todos). */
export interface SlaTimelineFilterSelection {
  period: SlaTimelinePeriod;
  kinds: SlaMilestoneKind[];
  statuses: SlaTimelineStatus[];
}

export function defaultSlaTimelineFilters(): SlaTimelineFilterSelection {
  return { period: 'all', kinds: [], statuses: [] };
}

function isPeriod(value: unknown): value is SlaTimelinePeriod {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value);
}

function isKind(value: unknown): value is SlaMilestoneKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is SlaTimelineStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

/** Mantém só valores conhecidos e sem repetição (chave adulterada não inventa filtro). */
function onlyKnown<T extends string>(value: unknown, guard: (v: unknown) => v is T): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    if (guard(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Lê a preferência salva. Sem storage, chave ausente, JSON quebrado ou lixo → default. */
export function loadSlaTimelineFilters(storage: Storage | null = safeStorage()): SlaTimelineFilterSelection {
  const fallback = defaultSlaTimelineFilters();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(SLA_TIMELINE_FILTERS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const record = parsed as Record<string, unknown>;
    return {
      period: isPeriod(record.period) ? record.period : fallback.period,
      kinds: onlyKnown(record.kinds, isKind),
      statuses: onlyKnown(record.statuses, isStatus),
    };
  } catch {
    return fallback;
  }
}

/** Grava a preferência. Storage indisponível ou cota cheia não interrompe a tela. */
export function saveSlaTimelineFilters(
  selection: SlaTimelineFilterSelection,
  storage: Storage | null = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      SLA_TIMELINE_FILTERS_STORAGE_KEY,
      JSON.stringify({ period: selection.period, kinds: selection.kinds, statuses: selection.statuses }),
    );
  } catch {
    /* storage indisponível: a preferência é conveniência, não requisito */
  }
}

/** Converte a seleção da tela no contrato do filtro puro. */
export function toSlaTimelineFilters(selection: SlaTimelineFilterSelection): SlaTimelineFilters {
  return {
    period: selection.period,
    kinds: selection.kinds.length === 0 ? 'all' : [...selection.kinds],
    statuses: selection.statuses.length === 0 ? 'all' : [...selection.statuses],
  };
}

/** O atalho está ligado quando só "em risco" e "estourado" estão selecionados. */
export function isRiskOnlyFilter(selection: SlaTimelineFilterSelection): boolean {
  return (
    selection.statuses.length === SLA_RISK_STATUSES.length &&
    SLA_RISK_STATUSES.every((status) => selection.statuses.includes(status))
  );
}

/**
 * Atalho de um clique "Só em risco/estourado": liga as duas situações de risco.
 * Se ele já está ligado, o mesmo clique desliga e devolve o filtro de situação
 * aberto de novo (volta a mostrar todas as situações).
 */
export function toggleRiskOnlyFilter(selection: SlaTimelineFilterSelection): SlaTimelineFilterSelection {
  return {
    ...selection,
    statuses: isRiskOnlyFilter(selection) ? [] : [...SLA_RISK_STATUSES],
  };
}
