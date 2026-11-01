import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export interface MultimodalExtractedData {
  productSpecs: string | null;
  quantity: number | null;
  references: string[];
  customizationDetails: string | null;
}

export interface MultimodalAnalysisResult {
  mediaDescription: string;
  extractedData: MultimodalExtractedData;
  salesContext: string;
  suggestedNextAction: string;
  scriptWithMedia: string;
}

interface UseMultimodalAnalysisOptions {
  messages: Array<{ content: string; sender: string }>;
  mediaUrl: string;
  mediaType?: 'image' | 'sticker' | 'video' | 'audio' | 'document';
}

interface UseMultimodalAnalysisReturn {
  result: MultimodalAnalysisResult | null;
  loading: boolean;
  error: string | null;
  analyze: () => Promise<void>;
  reset: () => void;
}

export function useMultimodalAnalysis({
  messages,
  mediaUrl,
  mediaType = 'image',
}: UseMultimodalAnalysisOptions): UseMultimodalAnalysisReturn {
  const [result, setResult] = useState<MultimodalAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async () => {
    if (!mediaUrl) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const { data, error: edgeError } = await invokeEdge<MultimodalAnalysisResult>(
        'ai-multimodal-analysis',
        { body: { messages, mediaUrl, mediaType } },
      );
      if (edgeError) { setError(edgeError.message); return; }
      if (data) setResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
  }, [messages, mediaUrl, mediaType]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return { result, loading, error, analyze, reset };
}
