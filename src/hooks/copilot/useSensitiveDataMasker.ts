import { useMemo, useCallback } from 'react';

export interface UseSensitiveDataMaskerOptions {
  enabled?: boolean;
}

export interface SensitiveDataMaskerResult {
  mask: (text: string) => string;
  hasSensitiveData: (text: string) => boolean;
}

// CPF: 000.000.000-00 or 00000000000
const CPF_RE = /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g;
// CNPJ: 00.000.000/0000-00
const CNPJ_RE = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g;
// Credit/debit cards: 4 groups of 4 digits
const CARD_RE = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g;
// Bank branch mention followed by digits
const BANK_BRANCH_RE = /ag[eê]ncia\s*[:\s]*\d{4,}/gi;

/**
 * CV-114 — Dados sensíveis.
 * ESTENDE IA-059: masks CPF, CNPJ, card numbers and bank branch info
 * before text is sent to the AI provider. Nothing sensitive goes to logs.
 */
export function useSensitiveDataMasker({ enabled = true }: UseSensitiveDataMaskerOptions = {}): SensitiveDataMaskerResult {
  const mask = useCallback(
    (text: string): string => {
      if (!enabled) return text;
      return text
        .replace(CPF_RE, '***.***.***-**')
        .replace(CNPJ_RE, '**.***.***/****-**')
        .replace(CARD_RE, '**** **** **** ****')
        .replace(BANK_BRANCH_RE, 'agência: ****');
    },
    [enabled],
  );

  const hasSensitiveData = useCallback(
    (text: string): boolean => {
      if (!enabled) return false;
      const patterns = [CPF_RE, CNPJ_RE, CARD_RE];
      return patterns.some(re => {
        re.lastIndex = 0;
        return re.test(text);
      });
    },
    [enabled],
  );

  return useMemo(() => ({ mask, hasSensitiveData }), [mask, hasSensitiveData]);
}
