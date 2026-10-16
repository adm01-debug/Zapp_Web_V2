import { useState, useEffect, useCallback } from 'react';

export interface ABGroupMetrics {
  groupId: string;
  label: string;
  vendorCount: number;
  avgOrderValue: number;
  conversionRate: number;
  avgResponseTimeMs: number;
  radarUsageRate: number;
  brindeCompletionRate: number;
  ordersCount: number;
  conversationsCount: number;
}

export interface ABComparison {
  pilotGroup: ABGroupMetrics;
  controlGroup: ABGroupMetrics;
  upliftOrderValuePct: number;
  upliftConversionPct: number;
  upliftResponseTimePct: number;
  isSignificant: boolean;
  sampleSizeAdequate: boolean;
  reportedAt: string;
}

export interface UsePilotABComparisonOptions {
  pilotGroupId: string;
  controlGroupId: string;
  periodDays?: number;
  autoLoad?: boolean;
}

export interface PilotABComparisonResult {
  comparison: ABComparison | null;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

/**
 * CV-146 — Comparação A/B entre grupos piloto e controle.
 * Fetches A/B metrics from /api/radar-ab-comparison and computes uplift percentages.
 */
export function usePilotABComparison({
  pilotGroupId,
  controlGroupId,
  periodDays = 30,
  autoLoad = true,
}: UsePilotABComparisonOptions): PilotABComparisonResult {
  const [comparison, setComparison] = useState<ABComparison | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        pilot_group_id: pilotGroupId,
        control_group_id: controlGroupId,
        period_days: String(periodDays),
      });
      const res = await fetch(`/api/radar-ab-comparison?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setComparison(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar comparação A/B');
    } finally {
      setIsLoading(false);
    }
  }, [pilotGroupId, controlGroupId, periodDays]);

  useEffect(() => {
    if (autoLoad) load();
  }, [autoLoad, load]);

  return { comparison, isLoading, error, load };
}
