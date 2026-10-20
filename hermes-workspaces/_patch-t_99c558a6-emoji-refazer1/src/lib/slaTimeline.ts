/**
 * Linha do tempo de SLA de um contato: marcos reais, prazo aplicado e situação.
 *
 * Tudo aqui é função pura (nada de rede): o hook `useContactSlaTimeline` lê
 * `conversation_sla` (abertura, 1ª resposta, resolução e as violações gravadas) e
 * `conversation_events` (transferências do TR1) e entrega as linhas cruas para cá.
 * Assim a regra "no prazo / em risco / estourado" fica provada sem subir o cliente
 * Supabase — e nenhum marco é inferido a partir de mensagem.
 */
import { startOfDay, subDays } from 'date-fns';

/** Situação de um marco. `na` = o marco não tem prazo (ou não tem dado para julgar). */
export type SlaTimelineStatus = 'ok' | 'warning' | 'breached' | 'na';

/** Acima desta fração do prazo o marco já está em risco. */
export const SLA_RISK_RATIO = 0.7;

export const SLA_STATUS_LABEL: Record<SlaTimelineStatus, string> = {
  ok: 'No prazo',
  warning: 'Em risco',
  breached: 'Estourado',
  na: '—',
};

/**
 * Situação a partir da duração consumida e do prazo em minutos.
 * No limite exato ainda NÃO é violação (mas já é risco): violação é passar do limite.
 */
export function slaStatusForDuration(
  durationMs: number | null,
  limitMinutes: number,
): SlaTimelineStatus {
  if (durationMs === null || !Number.isFinite(durationMs)) return 'na';
  if (!Number.isFinite(limitMinutes) || limitMinutes <= 0) return 'na';
  const limitMs = limitMinutes * 60_000;
  if (durationMs > limitMs) return 'breached';
  if (durationMs > limitMs * SLA_RISK_RATIO) return 'warning';
  return 'ok';
}

/** Duração curta e legível. Sem duração, travessão. */
export function formatSlaDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs)) return '—';
  const abs = Math.abs(durationMs);
  if (abs < 60_000) return `${Math.round(abs / 1000)}s`;
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}min`;
  if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)}h`;
  return `${Math.round(abs / 86_400_000)}d`;
}

export type SlaMilestoneKind = 'opened' | 'first_response' | 'resolution' | 'transfer';

export interface SlaMilestone {
  id: string;
  kind: SlaMilestoneKind;
  /** Instante do marco (ISO). */
  at: string;
  /** Prazo do marco (ISO) quando o tipo tem prazo; null para transferência. */
  deadlineAt: string | null;
  /** Duração consumida até o desfecho; null quando pendente ou sem prazo. */
  durationMs: number | null;
  status: SlaTimelineStatus;
  /** Prazo aplicado ao marco, em minutos; null quando o marco não tem prazo. */
  limitMinutes: number | null;
}

/** Linha de `conversation_sla` como o hook a lê. */
export interface SlaTimelineRow {
  id: string;
  first_message_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  first_response_breached: boolean | null;
  resolution_breached: boolean | null;
}

/** Linha de `conversation_events` como o hook a lê. */
export interface SlaTimelineEvent {
  id: string;
  event_type: string;
  created_at: string;
}

export interface SlaTimelineLimits {
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

/** Tipos de `conversation_events` que contam como transferência de conversa (TR1). */
export const SLA_TRANSFER_EVENT_TYPES = [
  'transfer',
  'queue_transfer',
  'overload_reassign',
  'absence_reassign',
] as const;

const TRANSFER_TYPES = new Set<string>(SLA_TRANSFER_EVENT_TYPES);

const MINUTE_MS = 60_000;

function toMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Monta os marcos reais do contato, do mais recente para o mais antigo.
 *
 * Regras:
 * - `opened`: um por linha de `conversation_sla`, no `first_message_at`, com o prazo da 1ª
 *   resposta. É marcador, não julgamento: a situação dele é `na`.
 * - `first_response`: quando há `first_response_at`, a duração real decide; a violação
 *   gravada (`first_response_breached`) manda sobre o relógio. Sem carimbo mas violada, o
 *   marco fica no instante do prazo e sai `breached`. Pendente, o marco fica na abertura e a
 *   situação é a de AGORA (relógio corrente) — é o que a tela mostra enquanto ninguém respondeu.
 * - `resolution`: só quando há `resolved_at`, com o prazo medido a partir da abertura.
 * - `transfer`: um por evento de transferência do TR1, sem prazo e sem situação.
 */
export function buildSlaMilestones(
  rows: SlaTimelineRow[],
  events: SlaTimelineEvent[],
  limits: SlaTimelineLimits,
  nowMs: number = Date.now(),
): SlaMilestone[] {
  const milestones: SlaMilestone[] = [];

  for (const row of rows) {
    const openedMs = toMs(row.first_message_at);
    if (openedMs === null) continue; // linha sem abertura válida não rende marco

    const firstResponseDeadlineMs = openedMs + limits.firstResponseMinutes * MINUTE_MS;
    const resolutionDeadlineMs = openedMs + limits.resolutionMinutes * MINUTE_MS;

    milestones.push({
      id: `${row.id}-opened`,
      kind: 'opened',
      at: new Date(openedMs).toISOString(),
      deadlineAt: new Date(firstResponseDeadlineMs).toISOString(),
      durationMs: null,
      status: 'na',
      limitMinutes: limits.firstResponseMinutes,
    });

    const respondedMs = toMs(row.first_response_at);
    if (respondedMs !== null) {
      const durationMs = respondedMs - openedMs;
      milestones.push({
        id: `${row.id}-first_response`,
        kind: 'first_response',
        at: new Date(respondedMs).toISOString(),
        deadlineAt: new Date(firstResponseDeadlineMs).toISOString(),
        durationMs,
        status: row.first_response_breached
          ? 'breached'
          : slaStatusForDuration(durationMs, limits.firstResponseMinutes),
        limitMinutes: limits.firstResponseMinutes,
      });
    } else if (row.first_response_breached) {
      milestones.push({
        id: `${row.id}-first_response`,
        kind: 'first_response',
        at: new Date(firstResponseDeadlineMs).toISOString(),
        deadlineAt: new Date(firstResponseDeadlineMs).toISOString(),
        durationMs: null,
        status: 'breached',
        limitMinutes: limits.firstResponseMinutes,
      });
    } else {
      const elapsedMs = Math.max(0, nowMs - openedMs);
      milestones.push({
        id: `${row.id}-first_response`,
        kind: 'first_response',
        at: new Date(openedMs).toISOString(),
        deadlineAt: new Date(firstResponseDeadlineMs).toISOString(),
        durationMs: elapsedMs,
        status: slaStatusForDuration(elapsedMs, limits.firstResponseMinutes),
        limitMinutes: limits.firstResponseMinutes,
      });
    }

    const resolvedMs = toMs(row.resolved_at);
    if (resolvedMs !== null) {
      const durationMs = resolvedMs - openedMs;
      milestones.push({
        id: `${row.id}-resolution`,
        kind: 'resolution',
        at: new Date(resolvedMs).toISOString(),
        deadlineAt: new Date(resolutionDeadlineMs).toISOString(),
        durationMs,
        status: row.resolution_breached
          ? 'breached'
          : slaStatusForDuration(durationMs, limits.resolutionMinutes),
        limitMinutes: limits.resolutionMinutes,
      });
    }
  }

  for (const event of events) {
    if (!TRANSFER_TYPES.has(event.event_type)) continue;
    const atMs = toMs(event.created_at);
    if (atMs === null) continue;
    milestones.push({
      id: `transfer-${event.id}`,
      kind: 'transfer',
      at: new Date(atMs).toISOString(),
      deadlineAt: null,
      durationMs: null,
      status: 'na',
      limitMinutes: null,
    });
  }

  return milestones.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

export type SlaTimelinePeriod = '24h' | '7d' | '30d' | 'all';

export interface SlaTimelineFilters {
  period?: SlaTimelinePeriod;
  kinds?: SlaMilestoneKind[] | 'all';
}

/** Janela em ms para o período. `24h` é corrido; `7d`/`30d` contam dias de calendário. */
export function slaWindowStartMs(period: SlaTimelinePeriod, nowMs: number): number | null {
  if (period === 'all') return null;
  if (period === '24h') return nowMs - 24 * 60 * MINUTE_MS;
  const days = period === '7d' ? 7 : 30;
  return startOfDay(subDays(new Date(nowMs), days - 1)).getTime();
}

/** Filtra por período e tipo sem tocar a rede (o dado já está em cache). */
export function filterSlaMilestones(
  milestones: SlaMilestone[],
  filters: SlaTimelineFilters = {},
  nowMs: number = Date.now(),
): SlaMilestone[] {
  const fromMs = slaWindowStartMs(filters.period ?? 'all', nowMs);
  const kinds = filters.kinds ?? 'all';
  const kindSet = kinds === 'all' ? null : new Set(kinds);

  return milestones.filter((milestone) => {
    if (kindSet && !kindSet.has(milestone.kind)) return false;
    if (fromMs === null) return true;
    const atMs = new Date(milestone.at).getTime();
    return Number.isFinite(atMs) && atMs >= fromMs && atMs <= nowMs;
  });
}
