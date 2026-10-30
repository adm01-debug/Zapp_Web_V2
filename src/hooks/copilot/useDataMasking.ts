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

const PATTERNS: Array<{ type: FieldType; regex: RegExp; mask: (m: string) => string }> = [
  { type: 'cpf', regex: /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}\b/g, mask: (m) => m.replace(/\d(?=\d{2})/g, '*') },
  { type: 'cnpj', regex: /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-.\s]?\d{2}\b/g, mask: (m) => m.replace(/\d(?=\d{4})/g, '*') },
  { type: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, mask: (m) => { const [local, domain] = m.split('@'); return `${local.slice(0, 2)}***@${domain}`; } },
  { type: 'phone', regex: /\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-.\s]?\d{4}\b/g, mask: (m) => m.replace(/\d(?=\d{4}$)/g, '*') },
  { type: 'card', regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, mask: () => '**** **** **** ****' },
  { type: 'cep', regex: /\b\d{5}-?\d{3}\b/g, mask: (m) => m.replace(/\d(?=\d{3})/g, '*') },
];

export function useDataMasking({ text, applyMask = false }: { text: string; applyMask?: boolean }): DataMaskingResult {
  return useMemo(() => {
    if (!text.trim()) return { maskedText: text, fields: [], hasPersonalData: false };
    const fields: MaskedField[] = [];
    let maskedText = text;
    let offset = 0;
    for (const { type, regex, mask } of PATTERNS) {
      const re = new RegExp(regex.source, regex.flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const original = match[0];
        const masked = mask(original);
        fields.push({ type, original, masked, index: match.index });
        if (applyMask) {
          const adjustedIndex = match.index + offset;
          maskedText = maskedText.slice(0, adjustedIndex) + masked + maskedText.slice(adjustedIndex + original.length);
          offset += masked.length - original.length;
        }
      }
    }
    return { maskedText, fields, hasPersonalData: fields.length > 0 };
  }, [text, applyMask]);
}
