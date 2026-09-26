/**
 * Contrato de status/resultado de ligação — plano 2.7 / etapa 10.
 *
 * Módulo TS puro: sem React, sem Supabase, sem efeito colateral.
 * Os rótulos ficam aqui em pt-BR; a cor (token de tom) é resolvida em classe
 * CSS no componente — aqui só viaja o token de tom.
 */

export type CallChannel = 'voip' | 'whatsapp';

export type CallDirection = 'inbound' | 'outbound';

/** Status persistido em `calls.status` (união do que existe hoje, com legado). */
export type PersistedStatus =
  | 'ringing'
  | 'answered'
  | 'ended'
  | 'missed'
  | 'busy'
  | 'failed'
  | 'cancelled'
  | 'declined';

/** Resultado exibido na coluna "Resultado" do histórico. */
export type CallResult =
  | 'completed'
  | 'missed'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'cancelled'
  | 'declined'
  | 'in_progress'
  | 'ringing';

/** Motivo de encerramento persistido em `calls.end_reason`. */
export type EndReason =
  | 'completed'
  | 'busy'
  | 'no_answer'
  | 'cancelled'
  | 'declined'
  | 'failed'
  | 'cancelled_remote'
  | 'timeout'
  | 'busy_here'
  | 'hangup_local'
  | 'hangup_remote';

/** Motivos que `sipCodeToEndReason` pode devolver (código SIP → motivo). */
export type SipEndReason = Extract<
  EndReason,
  'completed' | 'busy' | 'no_answer' | 'cancelled' | 'declined' | 'failed'
>;

/** Token de tom — vira classe CSS no componente, nunca aqui. */
export type ResultTone = 'success' | 'destructive' | 'warning' | 'muted' | 'primary';

/** Rótulos pt-BR do resultado (produto é pt-BR). */
export const RESULT_LABEL: Record<CallResult, string> = {
  completed: 'Concluída',
  missed: 'Perdida',
  no_answer: 'Não atendida',
  busy: 'Ocupado',
  failed: 'Falhou',
  cancelled: 'Cancelada',
  declined: 'Recusada',
  in_progress: 'Em andamento',
  ringing: 'Tocando',
};

/** Tom por resultado (token semântico, resolvido em classe no componente). */
export const RESULT_TONE: Record<CallResult, ResultTone> = {
  completed: 'success',
  missed: 'destructive',
  no_answer: 'warning',
  busy: 'warning',
  failed: 'destructive',
  cancelled: 'muted',
  declined: 'muted',
  in_progress: 'primary',
  ringing: 'primary',
};

/** Rótulo humano do `end_reason` (usado no painel de ligação selecionada). */
export const END_REASON_LABEL: Record<EndReason, string> = {
  completed: 'Concluída',
  busy: 'Ocupado',
  no_answer: 'Não atendida',
  cancelled: 'Cancelada por você',
  declined: 'Recusada',
  failed: 'Falhou',
  cancelled_remote: 'Cancelada por quem ligou',
  timeout: 'Não atendida a tempo',
  busy_here: 'Ocupado nesta linha',
  hangup_local: 'Encerrada por você',
  hangup_remote: 'Encerrada pelo outro lado',
};

const PERSISTED_STATUSES: readonly PersistedStatus[] = [
  'ringing',
  'answered',
  'ended',
  'missed',
  'busy',
  'failed',
  'cancelled',
  'declined',
];

const PERSISTED_STATUS_SET: ReadonlySet<string> = new Set<string>(PERSISTED_STATUSES);

/**
 * Tradução de legado, feita só na leitura (nunca `UPDATE` em massa):
 * `completed` → `ended`, `ongoing` → `answered`.
 */
const LEGACY_STATUS_ALIASES: Readonly<Record<string, PersistedStatus>> = {
  completed: 'ended',
  ongoing: 'answered',
};

function isPersistedStatus(value: string): value is PersistedStatus {
  return PERSISTED_STATUS_SET.has(value);
}

/**
 * Normaliza o valor cru de `calls.status` para o status persistido atual.
 * Devolve `null` quando não é um status conhecido.
 */
export function normalizeStatus(raw: unknown): PersistedStatus | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (key.length === 0) return null;
  if (Object.prototype.hasOwnProperty.call(LEGACY_STATUS_ALIASES, key)) {
    return LEGACY_STATUS_ALIASES[key];
  }
  return isPersistedStatus(key) ? key : null;
}

/**
 * Normaliza a direção. Devolve `null` quando o valor não é reconhecido
 * (linha sem direção informada).
 */
export function normalizeDirection(raw: unknown): CallDirection | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (key === 'inbound') return 'inbound';
  if (key === 'outbound') return 'outbound';
  return null;
}

/** Um timestamp só conta como preenchido se existir de fato (string vazia não conta). */
function hasValue(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'string') return raw.trim().length > 0;
  return true;
}

/** Campos de `calls` que a leitura de resultado precisa (tolerante a ausência). */
export interface CallStatusRow {
  status?: unknown;
  direction?: unknown;
  answered_at?: unknown;
  ended_at?: unknown;
}

/** Desfecho de uma ligação já encerrada: atendida → concluída; senão perdida/não atendida. */
function closedResult(row: CallStatusRow): CallResult {
  if (hasValue(row.answered_at)) return 'completed';
  // inbound → perdida; qualquer outra coisa (inclusive ausente) → não atendida
  return normalizeDirection(row.direction) === 'inbound' ? 'missed' : 'no_answer';
}

/**
 * Tabela 2.7 do plano: status persistido + contexto → resultado exibido.
 * Devolve `null` quando o status não é reconhecido (a UI mostra "—").
 */
export function toResult(row: CallStatusRow | null | undefined): CallResult | null {
  if (row === null || row === undefined) return null;
  const status = normalizeStatus(row.status);
  if (status === null) return null;

  switch (status) {
    case 'ended':
      return closedResult(row);
    case 'missed':
      return 'missed';
    case 'busy':
      return 'busy';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'declined':
      return 'declined';
    case 'answered':
      // atendida sem término → em andamento; com término → concluída
      return hasValue(row.ended_at) ? 'completed' : 'in_progress';
    case 'ringing':
      // tocando; se já tem término gravado, cai na regra de desfecho
      return hasValue(row.ended_at) ? closedResult(row) : 'ringing';
  }

  // inalcançável com a união atual; segurança para valor cru em runtime
  return null;
}

/**
 * Código SIP → motivo de encerramento.
 * 200 → concluída · 486 → ocupado · 480/408 → não atendida · 487 → cancelada
 * · 603 → recusada · 5xx e desconhecidos → falhou.
 */
export function sipCodeToEndReason(code: unknown): SipEndReason {
  let numeric = Number.NaN;
  if (typeof code === 'number') {
    numeric = code;
  } else if (typeof code === 'string' && code.trim().length > 0) {
    numeric = Number.parseInt(code.trim(), 10);
  }
  if (!Number.isFinite(numeric)) return 'failed';

  switch (numeric) {
    case 200:
      return 'completed';
    case 408:
    case 480:
      return 'no_answer';
    case 486:
      return 'busy';
    case 487:
      return 'cancelled';
    case 603:
      return 'declined';
    default:
      // 5xx (falha do servidor) e códigos desconhecidos → falha
      return 'failed';
  }
}
