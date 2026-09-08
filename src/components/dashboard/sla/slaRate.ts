/** Faixas de cor por taxa de SLA — mesma régua já usada em SLAMetricsDashboard hoje (>=90 bom, >=75 atenção, <75 crítico). */
export type SLARateTone = 'success' | 'warning' | 'destructive';

export function getSLARateTone(rate: number): SLARateTone {
  if (rate >= 90) return 'success';
  if (rate >= 75) return 'warning';
  return 'destructive';
}

export function getSLARateLabel(rate: number): string {
  if (rate >= 90) return 'Bom';
  if (rate >= 75) return 'Atenção';
  return 'Crítico';
}

export const SLA_RATE_TEXT_CLASS: Record<SLARateTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export const SLA_RATE_BG_CLASS: Record<SLARateTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

export const SLA_RATE_BADGE_CLASS: Record<SLARateTone, string> = {
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  destructive: 'bg-destructive/15 text-destructive border-destructive/30',
};
