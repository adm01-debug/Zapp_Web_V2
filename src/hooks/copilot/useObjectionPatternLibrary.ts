import { useState, useCallback } from 'react';

export interface ObjectionPattern {
  patternId: string;
  trigger: string;
  category: string;
  frequency: number;
  resolutionRate: number;
  bestResponse: string;
  alternativeResponses: string[];
  worstResponse: string | null;
}

export interface UseObjectionPatternLibraryOptions {
  teamId: string;
  stage?: string;
}

export interface ObjectionPatternLibraryState {
  patterns: ObjectionPattern[];
  isFetching: boolean;
  error: string | null;
  fetchPatterns: (stage?: string) => Promise<void>;
}

/**
 * CV-132 — Biblioteca de padrões de objeção com taxa de resolução.
 * GET /api/radar-objection-patterns?team_id=...&stage=...
 */
export function useObjectionPatternLibrary({
  teamId,
  stage,
}: UseObjectionPatternLibraryOptions): ObjectionPatternLibraryState {
  const [patterns, setPatterns] = useState<ObjectionPattern[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPatterns = useCallback(async (filterStage?: string) => {
    setIsFetching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ team_id: teamId });
      const s = filterStage ?? stage;
      if (s) params.set('stage', s);
      const res = await fetch(`/api/radar-objection-patterns?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ObjectionPattern[] = await res.json();
      setPatterns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar padrões');
    } finally {
      setIsFetching(false);
    }
  }, [teamId, stage]);

  return { patterns, isFetching, error, fetchPatterns };
}
