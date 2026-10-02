import { format, formatDistanceToNowStrict, isToday, isYesterday, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export const fmtInt = (n: number | null | undefined) => (n ?? 0).toLocaleString('pt-BR');
export const fmtPct = (num: number, den: number, digits = 1) =>
  den > 0 ? `${((num / den) * 100).toFixed(digits).replace('.', ',')}%` : '—';
export const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
export const fmtDateTime = (d: string | null | undefined) =>
  d ? format(new Date(d), "dd MMM yyyy, HH:mm", { locale: ptBR }) : '—';
export const fmtDate = (d: string | null | undefined) =>
  d ? format(new Date(d), 'dd/MM/yyyy', { locale: ptBR }) : '—';
export const fmtTime = (d: string | null | undefined) => (d ? format(new Date(d), 'HH:mm') : '—');
export const fmtAgo = (d: string | null | undefined) =>
  d ? formatDistanceToNowStrict(new Date(d), { locale: ptBR, addSuffix: true }) : '—';

/**
 * Data relativa curta para tabelas e listas:
 *   - hoje      → "Hoje, 10:00"
 *   - ontem     → "Ontem, 16:20"
 *   - anterior  → "15 set, 09:30"
 * Sem data (ou data inválida) devolve "—", nunca uma string inventada.
 */
export const fmtRelativeDay = (d: string | null | undefined) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const hm = format(date, 'HH:mm');
  if (isToday(date)) return `Hoje, ${hm}`;
  if (isYesterday(date)) return `Ontem, ${hm}`;
  return `${format(date, 'd MMM', { locale: ptBR }).replace('.', '')}, ${hm}`;
};

export function extractVariables(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)) found.add(`{{${m[1].toLowerCase()}}}`);
  return Array.from(found);
}

/** Estima duração (segundos) de uma campanha dado o nº de contatos e as médias de digitação/intervalo (ms). */
export function estimateSeconds(count: number, typingMin: number, typingMax: number, intervalMin: number, intervalMax: number) {
  return count * (((typingMin + typingMax) / 2 + (intervalMin + intervalMax) / 2) / 1000);
}
export function fmtDurationShort(seconds: number) {
  const m = Math.ceil(seconds / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `~${m} min`;
  return `~${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}min` : ''}`.trim();
}

/** Série de barras (sparkline) para os últimos `n` dias a partir de timestamps. */
export function barsByDay(dates: (string | null | undefined)[], n = 8): number[] {
  const buckets = Array.from({ length: n }, () => 0);
  const today = startOfDay(new Date());
  for (const d of dates) {
    if (!d) continue;
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) continue;
    const diff = Math.round((today.getTime() - startOfDay(date).getTime()) / 86_400_000);
    if (diff >= 0 && diff < n) buckets[n - 1 - diff] += 1;
  }
  return buckets;
}
