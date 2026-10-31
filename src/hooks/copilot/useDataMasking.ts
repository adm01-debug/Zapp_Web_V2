/**
 * CV-114 — Mascaramento de dados pessoais no rascunho.
 */
import { useMemo } from 'react';

export interface MaskedField {
  type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'card' | 'cep';
  original: string;
  masked: string;
  index: number;
}

export interface DataMaskingResult {
  maskedText: string;
  fields: MaskedField[];
  hasPersonalData: boolean;
}

type FieldType = MaskedField['type'];

// Replace all digits except the last `keepLast`, preserving separators.
// Using digit-count approach avoids lookahead failures on formatted strings like "(11) 99999-8888".
function maskLastDigits(m: string, keepLast: number): string {
  const digitCount = (m.match(/\d/g) ?? []).length;
  const maskCount = Math.max(0, digitCount - keepLast);
  let replaced = 0;
  return m.replace(/\d/g, (d) => (replaced++ < maskCount ? '*' : d));
}

const PATTERNS: Array<{ type: FieldType; regex: RegExp; mask: (m: string) => string }> = [
  { type: 'cpf',   regex: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b/g, mask: (m) => maskLastDigits(m, 2) },
  { type: 'cnpj',  regex: /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-.\s]?\d{2}\b/g, mask: (m) => maskLastDigits(m, 4) },
  { type: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    mask: (m) => { const [local, domain] = m.split('@'); return `${local.slice(0, 2)}***@${domain}`; } },
  { type: 'phone', regex: /\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-.\s]?\d{4}\b/g, mask: (m) => maskLastDigits(m, 4) },
  { type: 'card',  regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, mask: () => '**** **** **** ****' },
  { type: 'cep',   regex: /\b\d{5}-?\d{3}\b/g, mask: (m) => maskLastDigits(m, 3) },
];

export function useDataMasking({ text, applyMask = false }: { text: string; applyMask?: boolean }): DataMaskingResult {
  return useMemo(() => {
    if (!text.trim()) return { maskedText: text, fields: [], hasPersonalData: false };

    // Collect ALL matches first across all patterns before any splicing.
    // Sorting descending by index and splicing from the end eliminates offset bookkeeping:
    // each splice only affects positions that have already been processed.
    const allMatches: Array<{ type: FieldType; original: string; masked: string; index: number }> = [];
    for (const { type, regex, mask } of PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        allMatches.push({ type, original: match[0], masked: mask(match[0]), index: match.index });
      }
    }

    const fields: MaskedField[] = allMatches
      .slice()
      .sort((a, b) => a.index - b.index)
      .map(({ type, original, masked, index }) => ({ type, original, masked, index }));

    let maskedText = text;
    if (applyMask) {
      // Apply from end of string so earlier splices don't shift indices of later ones.
      allMatches
        .slice()
        .sort((a, b) => b.index - a.index)
        .forEach(({ masked, index, original }) => {
          maskedText = maskedText.slice(0, index) + masked + maskedText.slice(index + original.length);
        });
    }

    return { maskedText, fields, hasPersonalData: fields.length > 0 };
  }, [text, applyMask]);
}
