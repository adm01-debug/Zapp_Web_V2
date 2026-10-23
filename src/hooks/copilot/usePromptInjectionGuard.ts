import { useMemo } from 'react';

export interface UsePromptInjectionGuardOptions {
  text: string;
}

export interface PromptInjectionResult {
  isSafe: boolean;
  suspiciousPattern: string | null;
}

// Common prompt-injection patterns in PT-BR and EN
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(suas|as|suas\s+anteriores|all\s+previous)\s+instru[çc][oõ]es?/i,
  /aja\s+como/i,
  /voc[eê]\s+[eé]\s+agora/i,
  /novo\s+sistema\s+de\s+instru[çc][oõ]es?/i,
  /\[system\]/i,
  /\{system\}/i,
  /assistente[,:\s]+ignore/i,
  /forget\s+(your|previous)\s+instructions?/i,
  /you\s+are\s+now\s+a/i,
  /dan\s+mode/i,
  /jailbreak/i,
  /prompt\s+injection/i,
];

/**
 * CV-113 — Defesa contra instrução embutida (prompt injection).
 * DELEGADA a IA-184: pure client-side heuristic layer.
 * Client messages are treated as data, never as instructions.
 * Suspicious messages are flagged before being sent to the model.
 */
export function usePromptInjectionGuard({ text }: UsePromptInjectionGuardOptions): PromptInjectionResult {
  return useMemo(() => {
    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        return { isSafe: false, suspiciousPattern: pattern.source };
      }
    }
    return { isSafe: true, suspiciousPattern: null };
  }, [text]);
}
