// CV-115–116: Suggestion Filter hook
// Pipeline: privacy check (hard block) → tone check (soft warn/block)

import { usePrivacyGuard } from './usePrivacyGuard';
import { useToneGuard } from './useToneGuard';

export interface FilteredSuggestion {
  original: string;
  filtered: string;
  wasModified: boolean;
  blocked: boolean;
  blockedReasons: string[];
}

export function useSuggestionFilter() {
  const { checkText } = usePrivacyGuard();
  const { checkTone } = useToneGuard();

  const filterSuggestion = (text: string): FilteredSuggestion => {
    const blockedReasons: string[] = [];
    let filtered = text;
    let wasModified = false;
    let blocked = false;

    // Step 1: Privacy check — hard block if PII found
    const privacyResult = checkText(text);
    if (privacyResult.hasViolation) {
      blockedReasons.push('PII detectado');
      blocked = true;
      filtered = privacyResult.sanitizedText;
      wasModified = true;
    }

    // Step 2: Tone check
    const toneResult = checkTone(filtered);
    if (toneResult.hasIssues) {
      const hasHighSeverity = toneResult.issues.some((i) => i.severity === 'high');
      if (hasHighSeverity) {
        blockedReasons.push(
          ...toneResult.issues
            .filter((i) => i.severity === 'high')
            .map((i) => i.suggestion)
        );
        blocked = true;
      } else if (toneResult.improvedSuggestion) {
        // medium/low: apply improvement but allow
        filtered = toneResult.improvedSuggestion;
        wasModified = true;
      }
    }

    return {
      original: text,
      filtered,
      wasModified,
      blocked,
      blockedReasons,
    };
  };

  return { filterSuggestion };
}
