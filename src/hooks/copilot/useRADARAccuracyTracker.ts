import { useState, useCallback } from 'react';

export interface AccuracyMetrics {
  period: string;
  totalSuggestions: number;
  appliedSuggestions: number;
  successfulApplications: number;
  applicationRate: number;
  successRate: number;
  topAccurateSuggestionTypes: string[];
  topInaccurateSuggestionTypes: string[];
}

export interface UseRADARAccuracyTrackerOptions {
  vendorId?: string;
  teamId?: string;
  periodDays?: number;
}

export interface RADARAccuracyTrackerState {
  metrics: AccuracyMetrics | null;
  isFetching: boolean;
  error: string | null;
  fetchMetrics: () => Promise<void>;
  recordOutcome: (suggestionId: string, applied: boolean, successful: boolean) => Promise<void>;
}

/**
 * CV-133 — Rastreamento de acurácia das sugestões do RADAR.
 * GET /api/radar-accuracy; POST /api/radar-accuracy/outcome.
 */
export function useRADARAccuracyTracker({
  vendorId,
  teamId,
  periodDays = 30,
}: UseRADARAccuracyTrackerOptions): RADARAccuracyTrackerState {
  const [metrics, setMetrics] = useState<AccuracyMetrics | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period_days: String(periodDays) });
      if (vendorId) params.set('vendor_id', vendorId);
      if (teamId) params.set('team_id', teamId);
      const res = await fetch(`/api/radar-accuracy?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AccuracyMetrics = await res.json();
      setMetrics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar métricas');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId, teamId, periodDays]);

  const recordOutcome = useCallback(async (suggestionId: string, applied: boolean, successful: boolean) => {
    try {
      const res = await fetch('/api/radar-accuracy/outcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: suggestionId, applied, successful }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao registrar resultado');
    }
  }, []);

  return { metrics, isFetching, error, fetchMetrics, recordOutcome };
}
