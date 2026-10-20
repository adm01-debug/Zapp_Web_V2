/** Periodos da barra de filtros do Talk X (modulo .ts: nao exporta componente). */

export interface TalkXPeriodRange { from: Date; to: Date }

export const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'custom', label: 'Personalizado' },
  { value: 'all', label: 'Todo o período' },
];

export const PERIOD_LABELS: Record<string, string> = PERIOD_OPTIONS.reduce<Record<string, string>>(
  (acc, o) => { acc[o.value] = o.label; return acc; },
  {},
);

/**
 * Cálculo exposto de forma pura e verificável: converte a chave de período
 * em intervalo { from, to }. Retorna null para 'all', 'custom' ou vazio.
 */
export function resolvePeriodRange(
  period: string | null | undefined,
  now: Date = new Date(),
): TalkXPeriodRange | null {
  if (!period || period === 'all' || period === 'custom') return null;
  const from = new Date(now);
  const to = new Date(now);
  if (period === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (period === '7d') {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (period === '30d') {
    from.setDate(from.getDate() - 29);
    from.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    return null;
  }
  to.setHours(23, 59, 59, 999);
  return { from, to };
}
