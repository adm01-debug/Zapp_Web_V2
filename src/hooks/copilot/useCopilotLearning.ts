/**
 * CV-131 — Aprendizado do copiloto (stub Phase 14).
 *
 * Registra quais sugestões foram aceitas/rejeitadas pelo vendedor
 * para alimentar o modelo de personalização futuro.
 * Nesta fase: coleta de dados local; integração com edge em fase posterior.
 */
import { useCallback } from 'react';

export type SuggestionOutcome = 'accepted' | 'edited' | 'rejected' | 'ignored';

export interface LearningRecord {
  suggestionId: string;
  source: string;
  outcome: SuggestionOutcome;
  timestamp: number;
  conversationId: string;
}

export interface UseCopilotLearningOptions {
  conversationId: string;
  /** Callback para persistir o registro (ex: Supabase via edge). */
  onRecord?: (record: LearningRecord) => void;
}

export function useCopilotLearning({ conversationId, onRecord }: UseCopilotLearningOptions) {
  const record = useCallback(
    (suggestionId: string, source: string, outcome: SuggestionOutcome) => {
      const entry: LearningRecord = {
        suggestionId,
        source,
        outcome,
        timestamp: Date.now(),
        conversationId,
      };
      onRecord?.(entry);
    },
    [conversationId, onRecord],
  );

  return { record };
}
