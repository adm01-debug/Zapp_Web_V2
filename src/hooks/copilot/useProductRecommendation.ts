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
  const lastFetchRef = useRef<number>(0);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < COOLDOWN_MS) {
      log.debug('Cooldown ativo, pulando requisicao');
      return;
    }
    setIsLoading(true);
    try {
      const data = await invokeEdge<{ products: ProductRecommendation[] }>(
        'ai-suggest-products',
        { conversationId, brindeMeter },
      );
      const top3 = (data?.products ?? []).slice(0, MAX_RECOMMENDATIONS);
      setRecommendations(top3);
      lastFetchRef.current = now;
      onRecommendation?.(top3);
    } catch (err) {
      log.error('Erro ao buscar recomendacoes', err);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, brindeMeter, onRecommendation]);

  const stockAlert = recommendations.find(
    (r) => r.stock === 'low' || r.stock === 'out_of_stock',
  ) ?? null;

  return { recommendations, isLoading, refresh, stockAlert };
}
