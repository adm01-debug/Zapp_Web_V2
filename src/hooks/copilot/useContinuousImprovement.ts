import { useState, useCallback } from 'react';

export interface ImprovementGap {
  gapId: string;
  area: string;
  description: string;
  impactScore: number;
  effortScore: number;
  priority: number;
  suggestedAction: string;
  expectedUpliftPct: number;
  detectedAt: string;
}

export interface UsekontinuousImprovementOptions {
  vendorId?: string;
  teamId?: string;
}

export interface ContinuousImprovementState {
  gaps: ImprovementGap[];
  isFetching: boolean;
  error: string | null;
  fetchGaps: () => Promise<void>;
  acknowledgeGap: (gapId: string) => Promise<void>;
}

/**
 * CV-140 — Loop de melhoria contínua: identifica gaps e sugere ações de maior impacto.
 * GET /api/radar-continuous-improvement; PATCH ./{id}/acknowledge.
 */
export function useContinuousImprovement({
  vendorId,
  teamId,
}: UseontinuousImprovementOptions = {}): ContinuousImprovementState {
  const [gaps, setGaps] = useState<ImprovementGap[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGaps = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (vendorId) params.set('vendor_id', vendorId);
      if (teamId) params.set('team_id', teamId);
      const res = await fetch(`/api/radar-continuous-improvement?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ImprovementGap[] = await res.json();
      setGaps(data.sort((a, b) => b.priority - a.priority));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar gaps');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId, teamId]);

  const acknowledgeGap = useCallback(async (gapId: string) => {
    const res = await fetch(`/api/radar-continuous-improvement/${gapId}/acknowledge`, { method: 'PATCH' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setGaps(prev => prev.filter(g => g.gapId !== gapId));
  }, []);

  return { gaps, isFetching, error, fetchGaps, acknowledgeGap };
}

// Alias for interface consistency
export type UseontinuousImprovementOptions = UsekontinuousImprovementOptions;
