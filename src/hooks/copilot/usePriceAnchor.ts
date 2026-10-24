/**
 * CV-074, CV-075 — Phase 8: Price Anchor
 *
 * CV-074 (ESTENDE IA-153): Value framing — shows value-to-price ratio and anchor comparison.
 * CV-075 (ESTENDE IA-153): Discount guardrail D3 — blocks seller from offering beyond approved %.
 */
import { useState, useCallback } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('usePriceAnchor');

export interface PriceAnchorState {
  valueFraming: string;
  anchorComparison: string;
  /** Maximum discount % allowed for this seller/product */
  maxDiscountPct: number | null;
  /** Current proposed discount extracted from conversation */
  proposedDiscountPct: number | null;
  /** true if proposed discount exceeds guardrail */
  guardrailTriggered: boolean;
  loading: boolean;
}

export interface UsePriceAnchorOptions {
  conversationId: string;
  contactId: string;
  messages: Array<{ content: string; sender: string }>;
  sellerMaxDiscountPct?: number;
  enabled?: boolean;
}

export interface PriceAnchorActions {
  state: PriceAnchorState;
  analyze: (latestMessage: string) => void;
  dismiss: () => void;
}

const EMPTY_STATE: PriceAnchorState = {
  valueFraming: '',
  anchorComparison: '',
  maxDiscountPct: null,
  proposedDiscountPct: null,
  guardrailTriggered: false,
  loading: false,
};

export function usePriceAnchor({
  conversationId,
  contactId,
  messages,
  sellerMaxDiscountPct,
  enabled = true,
}: UsePriceAnchorOptions): PriceAnchorActions {
  const [state, setState] = useState<PriceAnchorState>(EMPTY_STATE);

  const dismiss = useCallback(() => setState(EMPTY_STATE), []);

  const analyze = useCallback(
    (latestMessage: string) => {
      if (!enabled || !latestMessage.trim()) return;

      setState((s) => ({ ...s, loading: true }));

      void (async () => {
        try {
          const recentMessages = messages.slice(-10).map((m) => ({
            content: m.content,
            sender: m.sender,
          }));

          const { data, error } = await invokeEdge<{
            valueFraming?: string;
            anchorComparison?: string;
            maxDiscountPct?: number;
            proposedDiscountPct?: number;
          }>('ai-price-anchor', {
            body: {
              conversationId,
              contactId,
              messages: recentMessages,
              latestMessage,
              sellerMaxDiscountPct,
            },
          });

          if (error || !data) {
            log.warn('ai-price-anchor falhou', { msg: error ?? 'sem dados' });
            setState((s) => ({ ...s, loading: false }));
            return;
          }

          const maxDiscount = data.maxDiscountPct ?? sellerMaxDiscountPct ?? null;
          const proposed = data.proposedDiscountPct ?? null;
          const guardrailTriggered =
            maxDiscount !== null && proposed !== null && proposed > maxDiscount;

          if (guardrailTriggered) {
            log.warn('guardrail de desconto disparado', { proposed, maxDiscount });
          }

          setState({
            valueFraming: data.valueFraming ?? '',
            anchorComparison: data.anchorComparison ?? '',
            maxDiscountPct: maxDiscount,
            proposedDiscountPct: proposed,
            guardrailTriggered,
            loading: false,
          });
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            log.warn('usePriceAnchor: erro', { msg: err.message });
          }
          setState((s) => ({ ...s, loading: false }));
        }
      })();
    },
    [enabled, conversationId, contactId, messages, sellerMaxDiscountPct],
  );

  return { state, analyze, dismiss };
}
