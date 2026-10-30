/**
 * CV-114 — Detector de PII (Personally Identifiable Information).
 *
 * Detecta dados pessoais no texto de mensagens antes de envio,
 * alertando o vendedor para confirmar se é intencional.
 * LGPD compliance básico.
 */
import { useMemo } from 'react';

export type PIIType = 'cpf' | 'cnpj' | 'phone' | 'email' | 'card' | 'address';

export interface PIIDetection {
  type: PIIType;
  /** Trecho mascarado para exibição. */
  maskedSample: string;
  label: string;
}

export interface PIIDetectorResult {
  hasPII: boolean;
  detections: PIIDetection[];
  warningMessage: string;
}

function mask(str: string): string {
  return str.replace(/\d/g, '*').substring(0, 8) + '…';
}

const PATTERNS: Array<{ type: PIIType; pattern: RegExp; label: string }> = [
  { type: 'cpf',     pattern: /\b\d{3}[.-]?\d{3}[.-]?\d{3}[.-]?\d{2}\b/, label: 'CPF' },
  { type: 'cnpj',    pattern: /\b\d{2}[.-]?\d{3}[.-]?\d{3}[/-]?\d{4}[.-]?\d{2}\b/, label: 'CNPJ' },
  { type: 'phone',   pattern: /\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)(?:9\s?)?\d{4}[-\s]?\d{4}\b/, label: 'Telefone' },
  { type: 'email',   pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}\b/, label: 'E-mail' },
  { type: 'card',    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, label: 'Cartão de crédito' },
];

export interface UsePIIDetectorOptions {
  text: string;
}

export function usePIIDetector({ text }: UsePIIDetectorOptions): PIIDetectorResult {
  return useMemo(() => {
    if (!text.trim()) return { hasPII: false, detections: [], warningMessage: '' };

    const detections: PIIDetection[] = [];
    for (const { type, pattern, label } of PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        detections.push({ type, maskedSample: mask(match[0]), label });
      }
    }

    const warningMessage = detections.length > 0
      ? `Atenção: ${detections.map((d) => d.label).join(', ')} detectado(s). Confirme antes de enviar.`
      : '';

    return { hasPII: detections.length > 0, detections, warningMessage };
  }, [text]);
}
