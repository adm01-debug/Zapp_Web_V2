import { useState, useEffect, useCallback } from 'react';

export interface VendorAdoptionEntry {
  vendorId: string;
  vendorName: string;
  teamId: string;
  radarSessionsCount: number;
  suggestionsShown: number;
  suggestionsApplied: number;
  applicationRate: number;
  daysActiveInPeriod: number;
  lastActiveAt: string;
  adoptionTier: 'champion' | 'active' | 'occasional' | 'dormant';
}

export interface TeamAdoptionSummary {
  teamId: string;
  teamName: string;
  vendorCount: number;
  championCount: number;
  dormantCount: number;
  avgApplicationRate: number;
  overallAdoptionRate: number;
}

export interface AdoptionMetrics {
  teamSummaries: TeamAdoptionSummary[];
  vendorEntries: VendorAdoptionEntry[];
  overallAdoptionRate: number;
  periodDays: number;
  reportedAt: string;
}

export interface UseAdoptionMetricsOptions {
  teamId?: string;
  periodDays?: number;
  autoLoad?: boolean;
}

export interface AdoptionMetricsResult {
  metrics: AdoptionMetrics | null;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
}

/**
 * CV-148 — Métricas de adoção por time/vendedor.
 * Fetches adoption metrics from /api/radar-adoption-metrics.
 * Classifies vendors into champion/active/occasional/dormant tiers.
 */
export function useAdoptionMetrics({
  teamId,
  periodDays = 30,
  autoLoad = true,
}: UseAdoptionMetricsOptions = {}): AdoptionMetricsResult {
  const [metrics, setMetrics] = useState<AdoptionMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period_days: String(periodDays) });
      if (teamId) params.set('team_id', teamId);
      const res = await fetch(`/api/radar-adoption-metrics?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMetrics(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar métricas de adoção');
    } finally {
      setIsLoading(false);
    }
  }, [teamId, periodDays]);

  useEffect(() => {
    if (autoLoad) load();
  }, [autoLoad, load]);

  return { metrics, isLoading, error, load };
}
