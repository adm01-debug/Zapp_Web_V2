import { useState, useCallback } from 'react';

export interface CoachingRecommendation {
  id: string;
  category: 'brinde' | 'objection' | 'timing' | 'next-step' | 'tone' | 'product-knowledge';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  evidenceCount: number;
  suggestedAction: string;
  resourceLink: string | null;
}

export interface UsePersonalizedCoachingOptions {
  vendorId: string;
  autoLoad?: boolean;
}

export interface PersonalizedCoachingState {
  recommendations: CoachingRecommendation[];
  isFetching: boolean;
  error: string | null;
  fetchRecommendations: () => Promise<void>;
  dismissRecommendation: (id: string) => Promise<void>;
  markCompleted: (id: string) => Promise<void>;
}

/**
 * CV-135 — Coaching personalizado baseado no histórico do vendedor.
 * GET /api/radar-coaching; PATCH ./{id}/dismiss ou ./{id}/complete.
 */
export function usePersonalizedCoaching({
  vendorId,
  autoLoad = false,
}: UsePersonalizedCoachingOptions): PersonalizedCoachingState {
  const [recommendations, setRecommendations] = useState<CoachingRecommendation[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    setIsFetching(true);
    setError(null);
    try {
      const res = await fetch(`/api/radar-coaching?vendor_id=${vendorId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: CoachingRecommendation[] = await res.json();
      setRecommendations(data.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar coaching');
    } finally {
      setIsFetching(false);
    }
  }, [vendorId]);

  const dismissRecommendation = useCallback(async (id: string) => {
    const res = await fetch(`/api/radar-coaching/${id}/dismiss`, { method: 'PATCH' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setRecommendations(prev => prev.filter(r => r.id !== id));
  }, []);

  const markCompleted = useCallback(async (id: string) => {
    const res = await fetch(`/api/radar-coaching/${id}/complete`, { method: 'PATCH' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setRecommendations(prev => prev.filter(r => r.id !== id));
  }, []);

  return { recommendations, isFetching, error, fetchRecommendations, dismissRecommendation, markCompleted };
}
