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

export type SlaMilestoneKind = 'opened' | 'first_response' | 'resolution' | 'transfer' | 'closed_no_response';

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
  /** Quem atendeu, quando o evento real de atribuição existe; null fora da 1ª resposta. */
  answeredBy: SlaAttribution | null;
}

/** Responsável por um marco: agente e/ou fila do evento real que atribuiu a conversa. */
export interface SlaAttribution {
  agentId: string | null;
  agentName: string | null;
  queueId: string | null;
  queueName: string | null;
}

/**
 * Texto de interface do responsável: `Respondido por X (fila Y)`.
 * Sem nenhum nome conhecido devolve `null` — o marco cala em vez de inventar.
 */
export function formatSlaAttribution(attribution: SlaAttribution | null): string | null {
  if (!attribution) return null;
  const agente = attribution.agentName?.trim() || null;
  const fila = attribution.queueName?.trim() || null;
  if (agente && fila) return `Respondido por ${agente} (fila ${fila})`;
  if (agente) return `Respondido por ${agente}`;
  if (fila) return `Respondido pela fila ${fila}`;
  return null;
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
  /** Agente que recebeu a conversa no evento (`assign`). */
  to_agent_id?: string | null;
  /** Fila que recebeu a conversa no evento (`queue_transfer` e afins). */
  to_queue_id?: string | null;
  /** `profiles` embutido pelo PostgREST quando há `to_agent_id`. */
  to_agent?: { id?: string | null; name?: string | null } | null;
  /** `queues` embutido pelo PostgREST quando há `to_queue_id`. */
  to_queue?: { id?: string | null; name?: string | null } | null;
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

/**
 * Tipos de `conversation_events` que atribuem a conversa a um agente: o gatilho do banco
 * grava `assign` no instante em que a conversa passa a ter responsável (`unassign` sai na volta).
 */
export const SLA_ASSIGN_EVENT_TYPES = ['assign'] as const;

const ASSIGN_TYPES = new Set<string>(SLA_ASSIGN_EVENT_TYPES);

const MINUTE_MS = 60_000;

function toMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

interface TimedEvent {
  atMs: number;
  event: SlaTimelineEvent;
}

/** Eventos com data válida, em ordem crescente (o desempate é o id). */
function timedEvents(events: SlaTimelineEvent[]): TimedEvent[] {
  return events
    .map((event) => ({ atMs: toMs(event.created_at), event }))
    .filter((timed): timed is TimedEvent => timed.atMs !== null)
    .sort((a, b) => a.atMs - b.atMs || a.event.id.localeCompare(b.event.id));
}

/**
 * Responsável pela 1ª resposta: último `assign` na janela [abertura, resposta].
 *
 * O gatilho do banco grava `assign` só com o agente (`to_queue_id` é do `queue_transfer`),
 * então a fila cai para o último evento da janela que traga fila — dado real, nunca
 * deduzido do contato. Sem `assign` nem fila na janela, a resposta não tem responsável.
 */
function firstResponseAttribution(
  assigns: TimedEvent[],
  queueChanges: TimedEvent[],
  fromMs: number,
  ateMs: number,
): SlaAttribution | null {
  const naJanela = (timed: TimedEvent) => timed.atMs >= fromMs && timed.atMs <= ateMs;
  const atribuicao = assigns.filter(naJanela).pop();
  const fila = queueChanges.filter(naJanela).pop();
  if (!atribuicao && !fila) return null;

  return {
    agentId: atribuicao?.event.to_agent?.id ?? atribuicao?.event.to_agent_id ?? null,
    agentName: atribuicao?.event.to_agent?.name ?? null,
    queueId:
      atribuicao?.event.to_queue?.id ??
      atribuicao?.event.to_queue_id ??
      fila?.event.to_queue?.id ??
      fila?.event.to_queue_id ??
      null,
    queueName: atribuicao?.event.to_queue?.name ?? fila?.event.to_queue?.name ?? null,
  };
}

/**
 * Monta os marcos reais do contato, do mais recente para o mais antigo.
 *
 * Regras:
 * - `opened`: um por linha de `conversation_sla`, no `first_message_at`, com o prazo da 1ª
 *   resposta. É marcador, não julgamento: a situação dele é `na`.
 * - `first_response`: quando há `first_response_at`, a duração real decide; a violação
 *   gravada (`first_response_breached`) manda sobre o relógio. Sem carimbo mas violada, o
 *   marco fica no instante do prazo e sai `breached`. Encerrada sem resposta (`resolved_at`
 *   presente), vira `closed_no_response` no instante do fechamento com duração fixa
 *   (`resolved_at - abertura`) — o relógio não corre mais e o marco não vira `breached` sozinho.
 *   Só quem segue aberto e sem resposta é pendente: o marco fica na abertura e a situação é a de
 *   AGORA (relógio corrente). Com resposta, o marco leva `answeredBy` (quem assumiu e em que
 *   fila, do `assign` da janela) — sem evento de atribuição, `null`.
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

  // Candidatos a atribuir a 1ª resposta: quem assumiu (`assign`) e qual fila a conversa
  // passou a ter. Só eventos gravados entram aqui.
  const comData = timedEvents(events);
  const assignEvents = comData.filter((timed) => ASSIGN_TYPES.has(timed.event.event_type));
  const queueChanges = comData.filter(
    (timed) => (timed.event.to_queue_id ?? timed.event.to_queue?.id ?? null) !== null,
  );

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
      answeredBy: null,
    });

    const respondedMs = toMs(row.first_response_at);
    const resolvedMs = toMs(row.resolved_at);
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
        answeredBy: firstResponseAttribution(assignEvents, queueChanges, openedMs, respondedMs),
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
        answeredBy: null,
      });
    } else if (resolvedMs !== null) {
      // Encerrada sem resposta: o prazo para de correr no fechamento. A duração é fixa
      // (`resolved_at - abertura`) e não olha o relógio — antes, este caso caía no ramo
      // pendente e virava "Estourado" sozinho conforme o tempo passava.
      const durationMs = Math.max(0, resolvedMs - openedMs);
      milestones.push({
        id: `${row.id}-closed_no_response`,
        kind: 'closed_no_response',
        at: new Date(resolvedMs).toISOString(),
        deadlineAt: new Date(firstResponseDeadlineMs).toISOString(),
        durationMs,
        status: slaStatusForDuration(durationMs, limits.firstResponseMinutes),
        limitMinutes: limits.firstResponseMinutes,
        answeredBy: null,
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
        answeredBy: null,
      });
    }

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
        answeredBy: null,
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
      answeredBy: null,
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
