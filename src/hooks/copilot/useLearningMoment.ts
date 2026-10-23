import { useState, useCallback } from 'react';

export interface LearningMoment {
  conversationId: string;
  tip: string;
  evidenceQuote: string;
  category: 'brinde' | 'objection' | 'timing' | 'next-step' | 'tone';
  generatedAt: string;
}

export interface UseLearningMomentOptions {
  conversationId: string;
  vendorId: string;
}

export interface LearningMomentState {
  moment: LearningMoment | null;
  isGenerating: boolean;
  error: string | null;
  generate: () => Promise<void>;
  dismiss: () => void;
}

/**
 * CV-125 — Micro-coaching contextual pós-conversa.
 * POST /api/radar-learning-moment com conversation_id e vendor_id.
 */
export function useLearningMoment({
  conversationId,
  vendorId,
}: UseLearningMomentOptions): LearningMomentState {
  const [moment, setMoment] = useState<LearningMoment | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/radar-learning-moment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, vendor_id: vendorId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: LearningMoment = await res.json();
      setMoment(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao gerar momento de aprendizado');
    } finally {
      setIsGenerating(false);
    }
  }, [conversationId, vendorId]);

  const dismiss = useCallback(() => setMoment(null), []);

  return { moment, isGenerating, error, generate, dismiss };
}
