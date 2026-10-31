/**
 * CV-102 — Análise de imagem (stub).
 */
import { useState, useCallback } from 'react';

export interface ImageAnalysisResult {
  description: string;
  extractedText: string[];
  isLoading: boolean;
  error: string | null;
}

export function useImageAnalysis(): ImageAnalysisResult & { analyze: (imageUrl: string) => Promise<void> } {
  const [description, setDescription] = useState('');
  const [extractedText, setExtractedText] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (_imageUrl: string) => {
    setIsLoading(true);
    setError(null);
    try {
      // DELEGADO: chamar edge function copilot-live com action=analyze_image
      setDescription('');
      setExtractedText([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na análise');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { description, extractedText, isLoading, error, analyze };
}
