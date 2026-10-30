/**
 * CV-103 — Extração de PDF (stub).
 *
 * Extrai briefing/especificações de PDFs enviados pelo cliente.
 * Integração com LLM delegada (CV-021).
 */
import { useState, useCallback } from 'react';

export interface PdfExtractionResult {
  text: string;
  summary: string;
  keyFields: Record<string, string>;
  isLoading: boolean;
  error: string | null;
}

export function usePdfExtraction(): PdfExtractionResult & { extract: (pdfUrl: string) => Promise<void> } {
  const [text, setText] = useState('');
  const [summary, setSummary] = useState('');
  const [keyFields, setKeyFields] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extract = useCallback(async (_pdfUrl: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // DELEGADO: chamar edge function copilot-live com action=extract_pdf
      setText('');
      setSummary('');
      setKeyFields({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na extração');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { text, summary, keyFields, isLoading, error, extract };
}
