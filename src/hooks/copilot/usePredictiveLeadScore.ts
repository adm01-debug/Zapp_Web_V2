import { useState, useCallback } from 'react';

export interface PredictiveLeadScore {
  conversationId: string;
  closeProbability: number;
  timeToCloseEstimateDays: number | null;
  estimatedOrderValue: number | null;
  topPositiveSignals: string[];
  topNegativeSignals: string[];
  confidence: number;
  scoredAt: string;
}

export interface UsePredictiveLeadScoreOptions {
  conversationId: string;
  autoScore?: boolean;
}

export interface PredictiveLeadScoreState {
  score: PredictiveLeadScore | null;
  isScoring: boolean;
  error: string | null;
  computeScore: () => Promise<void>;
}

/**
 * CV-139 — Score preditivo de probabilidade de fechamento.
 * POST /api/radar-predictive-score com conversation_id.
 */
export function usePredictiveLeadScore({
  conversationId,
  autoScore = false,
}: UsePredictiveLeadScoreOptions): PredictiveLeadScoreState {
  const [score, setScore] = useState<PredictiveLeadScore | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const computeScore = useCallback(async () => {
    setIsScoring(true);
    setError(null);
    try {
      const res = await fetch('/api/radar-predictive-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: PredictiveLeadScore = await res.json();
      setScore(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao calcular score');
    } finally {
      setIsScoring(false);
    }
  }, [conversationId]);

  return { score, isScoring, error, computeScore };
}
