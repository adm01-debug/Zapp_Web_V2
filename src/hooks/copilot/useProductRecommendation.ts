import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

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
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1/ai-product-recommendation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ messages, currentProduct, catalog }),
          signal: ctrl.signal,
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Erro ${res.status}: ${text}`);
      }
      const data = await res.json() as ProductRecommendationResult;
      setResult(data);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [messages, currentProduct, catalog]);

  return { result, loading, error, analyze };
}
