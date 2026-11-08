/**
 * CV-105 — Recomendação de produto por IA.
 *
 * Chama `ai-product-recommendation` com o histórico da conversa e parâmetros opcionais
 * (tipo de evento, orçamento, quantidade) para sugerir até 3 produtos ideais.
 */
import { useState, useCallback } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';

export interface ProductRecommendationItem {
  product: string;
  category: string;
  reasoning: string;
  estimatedPrice: string;
  confidence: number;
  urgency: 'low' | 'medium' | 'high';
}

export interface ProductRecommendationResult {
  recommendations: ProductRecommendationItem[];
  topPick: string;
  upsellOpportunity: string;
  isLoading: boolean;
  error: string | null;
}

export function useProductRecommendation(): ProductRecommendationResult & {
  recommend: (params: {
    messages: Array<{ content: string; sender: string; created_at?: string }>;
    eventType?: string;
    budget?: number;
    quantity?: number;
    context?: string;
  }) => Promise<void>;
} {
  const [recommendations, setRecommendations] = useState<ProductRecommendationItem[]>([]);
  const [topPick, setTopPick] = useState('');
  const [upsellOpportunity, setUpsellOpportunity] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recommend = useCallback(async (params: {
    messages: Array<{ content: string; sender: string; created_at?: string }>;
    eventType?: string;
    budget?: number;
    quantity?: number;
    context?: string;
  }) => {
    if (!params.messages.length) return;
    setIsLoading(true);
    setError(null);
    const { data, error: invokeError } = await invokeEdge<{
      recommendations: ProductRecommendationItem[];
      topPick: string;
      upsellOpportunity: string;
    }>('ai-product-recommendation', { body: params });
    if (invokeError || !data) {
      setError(invokeError?.message ?? 'Erro ao buscar recomendações');
    } else {
      setRecommendations(data.recommendations ?? []);
      setTopPick(data.topPick ?? '');
      setUpsellOpportunity(data.upsellOpportunity ?? '');
    }
    setIsLoading(false);
  }, []);

  return { recommendations, topPick, upsellOpportunity, isLoading, error, recommend };
}
