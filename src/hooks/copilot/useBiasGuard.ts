import { useCallback } from 'react';

export interface UseBiasGuardOptions {
  onBiasDetected?: (event: BiasEvent) => void;
}

export interface BiasEvent {
  field: string;
  valueA: string;
  valueB: string;
  suggestionA: string;
  suggestionB: string;
}

export interface BiasGuardResult {
  checkPair: (params: {
    field: string;
    valueA: string;
    valueB: string;
    suggestionA: string;
    suggestionB: string;
    threshold?: number;
  }) => boolean;
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = [...setA].filter(x => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

/**
 * CV-117 — Viés e respeito.
 * The RADAR must not adapt price or treatment based on inferred gender,
 * age, region or name. This hook checks pairs of suggestions for identical
 * contexts that differ only in a demographic field.
 */
export function useBiasGuard({ onBiasDetected }: UseBiasGuardOptions = {}): BiasGuardResult {
  const checkPair = useCallback(
    ({
      field,
      valueA,
      valueB,
      suggestionA,
      suggestionB,
      threshold = 0.3,
    }: {
      field: string;
      valueA: string;
      valueB: string;
      suggestionA: string;
      suggestionB: string;
      threshold?: number;
    }): boolean => {
      const similarity = jaccardSimilarity(suggestionA, suggestionB);
      const biasDetected = similarity < threshold;
      if (biasDetected) {
        onBiasDetected?.({ field, valueA, valueB, suggestionA, suggestionB });
      }
      return !biasDetected;
    },
    [onBiasDetected],
  );

  return { checkPair };
}
