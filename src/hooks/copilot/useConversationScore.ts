import { useState, useCallback } from 'react';

export interface ConversationScoreCriteria {
  brinde: number;
  objectionHandling: number;
  responseSpeed: number;
  nextStepAgreed: boolean;
}

export interface ConversationScore {
  conversationId: string;
  totalScore: number;
  criteria: ConversationScoreCriteria;
  label: 'Excelente' | 'Bom' | 'Regular' | 'Fraco';
  scoredAt: string;
}

export interface UseConversationScoreOptions {
  conversationId: string;
  vendorId: string;
}

export interface ConversationScoreState {
  score: ConversationScore | null;
  isScoring: boolean;
  error: string | null;
  scoreConversation: (criteria: ConversationScoreCriteria) => Promise<void>;
}

function computeLabel(total: number): ConversationScore['label'] {
  if (total >= 85) return 'Excelente';
  if (total >= 65) return 'Bom';
  if (total >= 45) return 'Regular';
  return 'Fraco';
}

/**
 * CV-124 — Pontuação de conversa com pesos BRINDE.
 * Pesos: brinde×40 + objeção×25 + velocidade×20 + próximo-passo×15.
 * POST /api/radar-conversation-score.
 */
export function useConversationScore({
  conversationId,
  vendorId,
}: UseConversationScoreOptions): ConversationScoreState {
  const [score, setScore] = useState<ConversationScore | null>(null);
  const [isScoring, setIsScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scoreConversation = useCallback(async (criteria: ConversationScoreCriteria) => {
    setIsScoring(true);
    setError(null);
    try {
      const total =
        criteria.brinde * 40 +
        criteria.objectionHandling * 25 +
        criteria.responseSpeed * 20 +
        (criteria.nextStepAgreed ? 15 : 0);
      const res = await fetch('/api/radar-conversation-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          vendor_id: vendorId,
          criteria,
          total_score: total,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: ConversationScore = await res.json();
      setScore({ ...result, totalScore: total, label: computeLabel(total) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao pontuar conversa');
    } finally {
      setIsScoring(false);
    }
  }, [conversationId, vendorId]);

  return { score, isScoring, error, scoreConversation };
}
