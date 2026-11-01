import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export interface ProductRecommendationItem {
  productName: string;
  reason: string;
  script: string;
  upsell: boolean;
}

export interface ProductRecommendationResult {
  recommendations: ProductRecommendationItem[];
  crossSellOpportunity: string | null;
  timingNote: string;
}

interface UseProductRecommendationOptions {
  messages: Array<{ content: string; sender: string }>;
  currentProduct?: string;
  catalog?: Array<{ name: string; sale_price?: number; suggested_price?: number; price?: number; description?: string }>;
}

interface UseProductRecommendationReturn {
  result: ProductRecommendationResult | null;
  loading: boolean;
  error: string | null;
  analyze: () => Promise<void>;
}

export function useProductRecommendation({
  messages,
  currentProduct = '',
  catalog = [],
}: UseProductRecommendationOptions): UseProductRecommendationReturn {
  const [result, setResult] = useState<ProductRecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    try {
      const { data, error: edgeError } = await invokeEdge<ProductRecommendationResult>(
        'ai-product-recommendation',
        { body: { messages, currentProduct, catalog } },
      );
      if (edgeError) { setError(edgeError.message); return; }
      if (data) setResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
  }, [messages, currentProduct, catalog]);

  return { result, loading, error, analyze };
}
