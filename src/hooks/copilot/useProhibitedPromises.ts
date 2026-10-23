import { useState, useCallback } from 'react';

export interface UseProhibitedPromisesOptions {
  onViolation?: (promises: string[]) => void;
}

export interface ProhibitedPromisesState {
  violations: string[];
  isChecking: boolean;
  isSafe: boolean;
}

/**
 * CV-112 — Lista de promessas proibidas.
 * DELEGADA a IA-074: thin wrapper that delegates to the promise-guard edge.
 * Prevents the AI from suggesting forbidden phrases ("garantimos", "prazo garantido", etc.)
 * unless backed by an explicit commercial rule.
 */
export function useProhibitedPromises(options: UseProhibitedPromisesOptions = {}) {
  const { onViolation } = options;
  const [state, setState] = useState<ProhibitedPromisesState>({
    violations: [],
    isChecking: false,
    isSafe: true,
  });

  const check = useCallback(
    async (suggestionText: string) => {
      setState(s => ({ ...s, isChecking: true }));
      try {
        const res = await fetch('/api/ai-check-prohibited-promises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: suggestionText }),
        });
        if (!res.ok) throw new Error(`prohibited-promises: ${res.status}`);
        const data = await res.json();
        const violations: string[] = data.violations ?? [];
        setState({ violations, isChecking: false, isSafe: violations.length === 0 });
        if (violations.length > 0) onViolation?.(violations);
      } catch {
        setState(s => ({ ...s, isChecking: false }));
      }
    },
    [onViolation],
  );

  const reset = useCallback(() => {
    setState({ violations: [], isChecking: false, isSafe: true });
  }, []);

  return { ...state, check, reset };
}
