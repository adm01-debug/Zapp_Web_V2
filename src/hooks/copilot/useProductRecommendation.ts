/**
 * CV-081, CV-082 — Recomendação de produtos e alerta de estoque.
 *
 * CV-081: chama a edge `ai-suggest-products` com o contexto BRINDE e retorna
 *   as 3 melhores recomendações com score de relevância e justificativa.
 * CV-082: identifica produto em estoque baixo/esgotado para exibir alerta.
 *   Cooldown de 30 s para evitar spam de requisições.
 */
import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useProductRecommendation');

const MAX_RECOMMENDATIONS = 3;
const COOLDOWN_MS = 30_000;

export type ProductStock = 'available' | 'low' | 'out_of_stock';

export interface ProductRecommendation {
  productId: string;
  name: string;
  imageUrl?: string;
  priceRange: { min: number; max: number; unit: string };
  minimumQty: number;
  stock: ProductStock;
  relevanceScore: number;
  reason: string;
}

export interface UseProductRecommendationOptions {
  conversationId: string;
  brindeMeter: {
    budget?: number;
    quantity?: number;
    occasion?: string;
    eventDate?: Date;
  };
  onRecommendation?: (products: ProductRecommendation[]) => void;
}

export interface UseProductRecommendationReturn {
  recommendations: ProductRecommendation[];
  isLoading: boolean;
  refresh: () => void;
  stockAlert: ProductRecommendation | null;
}

export function useProductRecommendation(
  options: UseProductRecommendationOptions,
): UseProductRecommendationReturn {
  const { conversationId, brindeMeter, onRecommendation } = options;

  const [recommendations, setRecommendations] = useState<ProductRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastCallRef = useRef<number>(0);

  const fetchRecommendations = useCallback(async (): Promise<void> => {
    const now = Date.now();
    if (now - lastCallRef.current < COOLDOWN_MS) {
      log.info('Cooldown ativo — ignorando requisição');
      return;
    }
    lastCallRef.current = now;
    setIsLoading(true);

    try {
      const payload = {
        conversationId,
        budget: brindeMeter.budget,
        quantity: brindeMeter.quantity,
        occasion: brindeMeter.occasion,
        eventDate: brindeMeter.eventDate?.toISOString(),
        maxResults: MAX_RECOMMENDATIONS,
      };

      const data = await invokeEdge<{ products: ProductRecommendation[] }>(
        'ai-suggest-products',
        payload,
      );

      const top = (data.products ?? []).slice(0, MAX_RECOMMENDATIONS);
      setRecommendations(top);
      onRecommendation?.(top);
    } catch (err) {
      log.error('Erro ao buscar recomendações', err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, brindeMeter, onRecommendation]);

  const stockAlert =
    recommendations.find(
      (p) => p.stock === 'out_of_stock' || p.stock === 'low',
    ) ?? null;

  return {
    recommendations,
    isLoading,
    refresh: fetchRecommendations,
    stockAlert,
  };
}
