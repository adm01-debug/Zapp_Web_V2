import { useState, useCallback } from 'react';

export interface ApprenticeExplanation {
  suggestionId: string;
  explanation: string;
  whyItWorks: string;
  generatedAt: string;
}

export interface ApprenticeWeeklyProgress {
  vendorId: string;
  weekOf: string;
  suggestionsViewed: number;
  suggestionsApplied: number;
  explanationsFetched: number;
  scoreImprovement: number;
}

export interface UseApprenticePathOptions {
  vendorId: string;
  initiallyActive?: boolean;
}

export interface ApprenticePathState {
  isActive: boolean;
  explanations: Record<string, ApprenticeExplanation>;
  weeklyProgress: ApprenticeWeeklyProgress | null;
  isFetching: boolean;
  error: string | null;
  toggle: () => void;
  fetchExplanation: (suggestionId: string, suggestionText: string) => Promise<void>;
  fetchWeeklyProgress: () => Promise<void>;
}

/**
 * CV-127 — Modo aprendiz: explicações passo a passo para cada sugestão.
 * POST /api/radar-apprentice/explain; GET /api/radar-apprentice/progress.
 */
export function useApprenticePath({
  vendorId,
  initiallyActive = false,
}: UseApprenticePathOptions): ApprenticePathState {
  const [isActive, setIsActive] = useState(initiallyActive);
  const [explanations, setExplanations] = useState<Record<string, ApprenticeExplanation>>({});
  const [weeklyProgress, setWeeklyProgress] = useState<ApprenticeWeeklyProgress | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback(() => setIsActive(v => !v), []);

  const fetchExplanation = useCallback(async (suggestionId: string, suggestionText: string) => {
    if (explanations[suggestionId]) return;
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch('/api/radar-apprentice/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: vendorId, suggestion_id: suggestionId, suggestion_text: suggestionText }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApprenticeExplanation = await res.json();
      setExplanations(prev => ({ ...prev, [suggestionId]: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar explicação');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId, explanations]);

  const fetchWeeklyProgress = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/radar-apprentice/progress?vendor_id=${vendorId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApprenticeWeeklyProgress = await res.json();
      setWeeklyProgress(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar progresso');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId]);

  return { isActive, explanations, weeklyProgress, isFetching, error, toggle, fetchExplanation, fetchWeeklyProgress };
}
