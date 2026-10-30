/**
 * CV-131 — Aprendizado do copiloto (stub Phase 14).
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

export function useCopilotLearning({ conversationId, onRecord }: { conversationId: string; onRecord?: (record: LearningRecord) => void }) {
  const record = useCallback(
    (suggestionId: string, source: string, outcome: SuggestionOutcome) => {
      const entry: LearningRecord = { suggestionId, source, outcome, timestamp: Date.now(), conversationId };
      onRecord?.(entry);
    },
    [conversationId, onRecord],
  );
  return { record };
}
