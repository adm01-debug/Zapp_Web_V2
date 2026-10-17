import { useState, useCallback } from 'react';

export type FeedbackCategory =
  | 'suggestion-quality'
  | 'ux-friction'
  | 'false-positive'
  | 'missing-feature'
  | 'performance'
  | 'other';

export interface PilotFeedback {
  feedbackId: string;
  vendorId: string;
  cohortId: string;
  category: FeedbackCategory;
  rating: 1 | 2 | 3 | 4 | 5;
  text: string;
  conversationId?: string;
  cvRef?: string;
  submittedAt: string;
}

export interface UsePilotFeedbackCollectorOptions {
  cohortId: string;
  vendorId: string;
  onSubmit?: (feedback: PilotFeedback) => Promise<void>;
}

export interface PilotFeedbackCollectorResult {
  feedbacks: PilotFeedback[];
  isSubmitting: boolean;
  error: string | null;
  submit: (
    category: FeedbackCategory,
    rating: PilotFeedback['rating'],
    text: string,
    opts?: { conversationId?: string; cvRef?: string },
  ) => Promise<void>;
  clearLocal: () => void;
}

let feedbackSeq = 0;

/**
 * CV-145 — Coleta de feedback estruturado do piloto.
 * Collects vendor feedback during the pilot, with category, rating and free text.
 * Calls the provided onSubmit callback (expected to POST to the backend).
 */
export function usePilotFeedbackCollector({
  cohortId,
  vendorId,
  onSubmit,
}: UsePilotFeedbackCollectorOptions): PilotFeedbackCollectorResult {
  const [feedbacks, setFeedbacks] = useState<PilotFeedback[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (
      category: FeedbackCategory,
      rating: PilotFeedback['rating'],
      text: string,
      opts: { conversationId?: string; cvRef?: string } = {},
    ) => {
      const feedback: PilotFeedback = {
        feedbackId: `fb-${Date.now()}-${++feedbackSeq}`,
        vendorId,
        cohortId,
        category,
        rating,
        text,
        ...opts,
        submittedAt: new Date().toISOString(),
      };
      setIsSubmitting(true);
      setError(null);
      try {
        await onSubmit?.(feedback);
        setFeedbacks(prev => [...prev, feedback]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro ao enviar feedback');
      } finally {
        setIsSubmitting(false);
      }
    },
    [cohortId, vendorId, onSubmit],
  );

  const clearLocal = useCallback(() => setFeedbacks([]), []);

  return { feedbacks, isSubmitting, error, submit, clearLocal };
}
