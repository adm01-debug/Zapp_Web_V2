// CV-125–126: useTrainingMode hook
// Training mode: show the vendor WHY each suggestion was generated

import { useCallback, useState } from 'react';

export interface SuggestionExplanation {
  suggestionId: string;
  reasoning: string;
  triggerSignals: string[];
  alternativeCount: number;
  confidenceScore: number; // 0-1
}

export interface UseTrainingModeResult {
  isEnabled: boolean;
  toggle: () => void;
  getExplanation: (suggestionId: string) => SuggestionExplanation | null;
}

const LS_KEY = 'copilot-training-mode';

function readLocalStorage(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeLocalStorage(value: boolean): void {
  try {
    localStorage.setItem(LS_KEY, String(value));
  } catch {
    // ignore write errors (private mode, storage full, etc.)
  }
}

// Mock explanation factory — real implementation would call the AI layer
function buildMockExplanation(suggestionId: string): SuggestionExplanation {
  return {
    suggestionId,
    reasoning:
      'Esta sugestão foi gerada porque o cliente mencionou preocupação com prazo e o estágio atual é Proposta.',
    triggerSignals: ['Cliente mencionou prazo', 'Estágio: Proposta', 'Última resposta há mais de 2h'],
    alternativeCount: 2,
    confidenceScore: 0.78,
  };
}

/**
 * CV-125–126
 * Enables/disables training mode (persisted to localStorage).
 * When enabled, the UI can show explanations for each RADAR suggestion.
 */
export function useTrainingMode(): UseTrainingModeResult {
  const [isEnabled, setIsEnabled] = useState<boolean>(readLocalStorage);

  const toggle = useCallback(() => {
    setIsEnabled((prev) => {
      const next = !prev;
      writeLocalStorage(next);
      return next;
    });
  }, []);

  const getExplanation = useCallback(
    (suggestionId: string): SuggestionExplanation | null => {
      if (!isEnabled) return null;
      return buildMockExplanation(suggestionId);
    },
    [isEnabled],
  );

  return { isEnabled, toggle, getExplanation };
}
