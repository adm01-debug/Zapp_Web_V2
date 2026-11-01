import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ai-multimodal-analysis`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ messages, mediaUrl, mediaType }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Erro ${res.status}: ${text}`);
      }
      const data = await res.json() as MultimodalAnalysisResult;
      setResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
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
