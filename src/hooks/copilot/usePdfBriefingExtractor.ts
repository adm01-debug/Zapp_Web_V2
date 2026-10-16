import { useState, useCallback } from 'react';
import type { BRINDEFields } from './useLeadThermometer';

export interface UsePdfBriefingExtractorOptions {
  onExtracted?: (fields: Partial<BRINDEFields>) => void;
}

export interface PdfExtractionState {
  extracted: Partial<BRINDEFields> | null;
  isExtracting: boolean;
  error: string | null;
}

/**
 * CV-106 — DELEGADA a IA-134.
 * Client sends a PDF briefing → RADAR extracts BRINDE fields from it.
 */
export function usePdfBriefingExtractor(options: UsePdfBriefingExtractorOptions = {}) {
  const { onExtracted } = options;
  const [state, setState] = useState<PdfExtractionState>({
    extracted: null,
    isExtracting: false,
    error: null,
  });

  const extract = useCallback(async (pdfUrl: string) => {
    setState(s => ({ ...s, isExtracting: true, error: null }));
    try {
      const resp = await fetch('/api/ai-extract-pdf-brinde', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf_url: pdfUrl }),
      });
      if (!resp.ok) throw new Error(`pdf extraction error ${resp.status}`);
      const fields: Partial<BRINDEFields> = await resp.json();
      setState({ extracted: fields, isExtracting: false, error: null });
      onExtracted?.(fields);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao extrair briefing';
      setState({ extracted: null, isExtracting: false, error: msg });
    }
  }, [onExtracted]);

  const reset = useCallback(() => {
    setState({ extracted: null, isExtracting: false, error: null });
  }, []);

  return { ...state, extract, reset };
}
