/**
 * Duração de ligação — plano 2.7 / etapa 11.
 *
 * `talk_seconds` (atendimento → término) é a duração oficial. O
 * `duration_seconds` legado não é lido aqui. Módulo TS puro.
 */

/** Rótulo usado quando não há duração válida. */
export const NO_DURATION_LABEL = '—';

/** Campos de `calls` que a duração precisa (tolerante a ausência). */
export interface TalkRow {
  talk_seconds?: unknown;
  answered_at?: unknown;
  ended_at?: unknown;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** Converte número/número-em-string em número finito; qualquer outra coisa → null. */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Converte timestamp (Date | número epoch ms | string ISO) em epoch ms; inválido → null. */
export function parseTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  const numeric = toFiniteNumber(value);
  if (typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value.trim()))) {
    return numeric;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Duração em segundos: usa `talk_seconds` quando existe; senão calcula por
 * `answered_at` → `ended_at`. Sem os dois timestamps → null.
 * Intervalo negativo (relógio invertido) é tratado como inválido → null.
 */
export function talkSeconds(row: TalkRow | null | undefined): number | null {
  if (row === null || row === undefined) return null;

  const explicit = toFiniteNumber(row.talk_seconds);
  if (explicit !== null) return Math.round(explicit);

  const answered = parseTimestamp(row.answered_at);
  const ended = parseTimestamp(row.ended_at);
  if (answered === null || ended === null) return null;

  const diff = (ended - answered) / 1000;
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.round(diff);
}

/** Segundos válidos (> 0) arredondados; null|0|negativo|inválido → null. */
function normalizeSeconds(seconds: number | null | undefined): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  return total > 0 ? total : null;
}

/**
 * Relógio da linha/painel: `mm:ss` até 59:59 e `h:mm:ss` a partir de 1 h.
 * Ex.: 258 → '04:18' · 3756 → '1:02:36'. Sem duração → '—'.
 */
export function formatClock(seconds: number | null | undefined): string {
  const total = normalizeSeconds(seconds);
  if (total === null) return NO_DURATION_LABEL;

  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  return `${pad2(minutes)}:${pad2(secs)}`;
}

/**
 * Duração para KPI/coluna: '45s' · '3m 42s' · '1h 02m'.
 * Sem duração → '—'.
 */
export function formatTalk(seconds: number | null | undefined): string {
  const total = normalizeSeconds(seconds);
  if (total === null) return NO_DURATION_LABEL;

  if (total < 60) return `${total}s`;
  if (total < 3600) {
    return `${Math.floor(total / 60)}m ${pad2(total % 60)}s`;
  }
  return `${Math.floor(total / 3600)}h ${pad2(Math.floor((total % 3600) / 60))}m`;
}
