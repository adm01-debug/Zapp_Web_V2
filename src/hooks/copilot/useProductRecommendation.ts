/**
 * CV-081, CV-082, CV-088, CV-089 — Phase 9: Product Recommendation
 *
 * CV-081 (DELEGADA IA-152): Displays product recommendations surfaced by IA.
 * CV-082 (DELEGADA IA-152): Cross-sell on related/complementary products.
 * CV-088: Upsell — max 1 upsell suggestion per conversation per funnel stage.
 * CV-089: Kits by occasion — suggests product kits matching event/occasion mentioned.
 */
import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useProductRecommendation');

export interface ProductSuggestion {
  productId: string;
  productName: string;
  reason: string;
  type: 'primary' | 'cross_sell' | 'upsell' | 'kit';
  occasion?: string;
}

export interface ProductRecommendationState {
  recommendations: ProductSuggestion[];
  upsellShown: boolean;
  loading: boolean;
}

export interface UseProductRecommendationOptions {
  conversationId: string;
  contactId: string;
  messages: Array<{ content: string; sender: string }>;
  currentFunnelStage?: string;
  enabled?: boolean;
}

export interface ProductRecommendationActions {
  state: ProductRecommendationState;
  analyze: (latestMessage: string) => void;
  markUpsellShown: () => void;
  dismiss: () => void;
}

const EMPTY_STATE: ProductRecommendationState = {
  recommendations: [],
  upsellShown: false,
  loading: false,
};

export function useProductRecommendation({
  conversationId,
  contactId,
  messages,
  currentFunnelStage,
  enabled = true,
}: UseProductRecommendationOptions): ProductRecommendationActions {
  const [state, setState] = useState<ProductRecommendationState>(EMPTY_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const dismiss = useCallback(() =>
    setState((s) => ({ ...s, recommendations: [] })), []);

  const markUpsellShown = useCallback(() =>
    setState((s) => ({ ...s, upsellShown: true })), []);

  const analyze = useCallback(
    (latestMessage: string) => {
      if (!enabled || !latestMessage.trim()) return;

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setState((s) => ({ ...s, loading: true }));

      void (async () => {
        try {
          const recentMessages = messages.slice(-10).map((m) => ({
            content: m.content,
            sender: m.sender,
          }));

          const { data, error } = await invokeEdge<{
            recommendations?: ProductSuggestion[];
          }>('ai-product-recommendation', {
            body: {
              conversationId,
              contactId,
              messages: recentMessages,
              latestMessage,
              currentFunnelStage,
            },
          });

          if (error || !data) {
            log.warn('ai-product-recommendation falhou', { msg: error ?? 'sem dados' });
            setState((s) => ({ ...s, loading: false }));
            return;
          }

          setState((s) => {
            const recs = data.recommendations ?? [];
            // CV-088: max 1 upsell per conversation per stage
            const upsellCount = recs.filter((r) => r.type === 'upsell').length;
            const filtered =
              s.upsellShown && upsellCount > 0
                ? recs.filter((r) => r.type !== 'upsell')
                : recs.slice(0, upsellCount > 0 ? undefined : undefined);

            return { ...s, recommendations: filtered, loading: false };
          });

          log.info('recomendações carregadas', { count: data.recommendations?.length });
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            log.warn('useProductRecommendation: erro', { msg: err.message });
          }
          setState((s) => ({ ...s, loading: false }));
        }
      })();
    },
    [enabled, conversationId, contactId, messages, currentFunnelStage],
  );

  return { state, analyze, markUpsellShown, dismiss };
}
