/**
 * C121 / IP2-B — série temporal de pausas de instância (24h por hora, 7d por dia).
 * Agregação pura sobre as linhas de `instance_pauses` (sem DDL): cada pausa conta no
 * balde do instante em que começou (`created_at`), separada em manual × automática.
 */

export type PauseWindow = '24h' | '7d';

export interface PauseRow {
  created_at: string;
  paused_until: string;
  resumed_at: string | null;
  auto: boolean;
}

export interface PauseBucket {
  start: number;
  manual: number;
  auto: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function buildPauseSeries(rows: PauseRow[], window: PauseWindow, now: number): PauseBucket[] {
  const step = window === '24h' ? HOUR_MS : DAY_MS;
  const count = window === '24h' ? 24 : 7;
  // último balde termina em `now`; cada balde cobre [start, start + step)
  const first = now - count * step;
  const buckets: PauseBucket[] = Array.from({ length: count }, (_, i) => ({
    start: first + i * step,
    manual: 0,
    auto: 0,
  }));
  for (const row of rows) {
    const t = Date.parse(row.created_at);
    if (Number.isNaN(t) || t < first || t >= now) continue;
    const bucket = buckets[Math.min(count - 1, Math.floor((t - first) / step))];
    if (row.auto) bucket.auto += 1;
    else bucket.manual += 1;
  }
  return buckets;
}

/** Pausa em vigor: não retomada e dentro do prazo (mesma regra de `is_instance_paused`). */
export function isPauseActive(row: Pick<PauseRow, 'paused_until' | 'resumed_at'>, now: number): boolean {
  return row.resumed_at === null && Date.parse(row.paused_until) > now;
}
