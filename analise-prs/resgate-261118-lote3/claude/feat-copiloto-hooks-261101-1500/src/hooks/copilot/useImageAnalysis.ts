/**
 * CV-102 — Análise de imagem via edge `ai-multimodal-analysis`.
 */
import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export interface ImageExtractedData {
  productSpecs: string | null;
  quantity: number | null;
  references: string[];
  customizationDetails: string | null;
}

export interface ImageAnalysisResult {
  mediaDescription: string;
  extractedData: ImageExtractedData;
  salesContext: string;
  suggestedNextAction: string;
  scriptWithMedia: string;
}

export interface UseImageAnalysisReturn {
  result: ImageAnalysisResult | null;
  isLoading: boolean;
  error: string | null;
  analyze: (imageUrl: string, mediaType?: string, messages?: Array<{ content: string; sender: string }>) => Promise<void>;
}

export function useImageAnalysis(): UseImageAnalysisReturn {
  const [result, setResult] = useState<ImageAnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async (
    imageUrl: string,
    mediaType = 'image',
    messages: Array<{ content: string; sender: string }> = [],
  ) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: edgeError } = await invokeEdge<ImageAnalysisResult>('ai-multimodal-analysis', {
        body: { messages, mediaUrl: imageUrl, mediaType },
      });
      if (edgeError) { setError(edgeError.message); return; }
      if (data) setResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      if (!abortRef.current?.signal.aborted) setIsLoading(false);
    }
  }, []);

  return { result, isLoading, error, analyze };
}
