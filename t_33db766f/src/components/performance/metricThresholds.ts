export type MetricStatus = 'good' | 'warning' | 'critical';

/** Classifica um valor contra limites crescentes: < goodBelow → good, < warningBelow → warning, senão critical. */
export function rateThreshold(value: number, goodBelow: number, warningBelow: number): MetricStatus {
  if (value < goodBelow) return 'good';
  if (value < warningBelow) return 'warning';
  return 'critical';
}

export function rateNetwork(effectiveType: string): MetricStatus {
  if (effectiveType === '4g') return 'good';
  if (effectiveType === '3g') return 'warning';
  return 'critical';
}

/** Percentual (0-100) de métricas com status "good"; lista vazia → 0. */
export function computeOverallScore(metrics: Array<{ status: MetricStatus }>): number {
  return Math.round((metrics.filter(m => m.status === 'good').length / Math.max(metrics.length, 1)) * 100);
}
