import { useState, useCallback } from 'react';

export interface UseFactCheckerOptions {
  onFactViolation?: (violations: FactViolation[]) => void;
}

export interface FactViolation {
  claim: string;
  expectedValue: string | null;
  source: string;
}

export interface FactCheckState {
  violations: FactViolation[];
  isChecking: boolean;
  isSafe: boolean;
  error: string | null;
}

/**
 * CV-111 — Verificador de fatos antes de mostrar.
 * DELEGADA a IA-073, IA-074: thin wrapper that POSTs to the fact-check edge.
 * Any suggestion with a number (price, deadline, quantity, stock) must pass this
 * before being displayed to the vendor.
 */
export function useFactChecker(options: UseFactCheckerOptions = {}) {
  const { onFactViolation } = options;
  const [state, setState] = useState<FactCheckState>({
    violations: [],
    isChecking: false,
    isSafe: true,
    error: null,
  });

  const check = useCallback(
    async (suggestionText: string, conversationId: string) => {
      setState(s => ({ ...s, isChecking: true, error: null }));
      try {
        const res = await fetch('/api/ai-fact-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: suggestionText, conversation_id: conversationId }),
        });
        if (!res.ok) throw new Error(`fact-check: ${res.status}`);
        const data = await res.json();
        const violations: FactViolation[] = data.violations ?? [];
        setState({ violations, isChecking: false, isSafe: violations.length === 0, error: null });
        if (violations.length > 0) onFactViolation?.(violations);
      } catch (err) {
        setState(s => ({ ...s, isChecking: false, error: (err as Error).message }));
      }
    },
    [onFactViolation],
  );

  const reset = useCallback(() => {
    setState({ violations: [], isChecking: false, isSafe: true, error: null });
  }, []);

  return { ...state, check, reset };
}
