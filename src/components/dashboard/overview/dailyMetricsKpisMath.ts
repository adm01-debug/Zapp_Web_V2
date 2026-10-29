import type { DailyMetricRow } from '@/hooks/dashboard/useDailyMetricsKpis';

/**
 * Variação % do último dia do período sobre o anterior.
 * Omitida (null) quando não há dia anterior ou a base é 0 — divisão indefinida:
 * mostra "—" em vez de um +∞/0 falso.
 */
export function lastDayVariationPct(
  rows: DailyMetricRow[],
  pick: (row: DailyMetricRow) => number | null,
): number | null {
  if (rows.length < 2) return null;
  const current = pick(rows[rows.length - 1]);
  const previous = pick(rows[rows.length - 2]);
  if (current == null || previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
