/**
 * CV-071 to CV-080 — Phase 8: Objection Handler
 *
 * CV-071 (DELEGADA IA-077): Objection detected → shows treatment script from IA result.
 * CV-072 (ESTENDE IA-078): Adds competitor detection; if competitor → shows battlecard.
 * CV-073: Battlecard data — competitor vs product talking points.
 * CV-076: Trade-in handler — prospect has used product to trade.
 * CV-077: "Vou pensar" handler — stall/delay objection.
 * CV-078: Minimum quantity — offer smaller lot for budget objection.
 * CV-080: Post-no recovery — after hard rejection, suggest lighter commitment.
 */
import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useObjectionHandler');

export type ObjectionType =
  | 'price'
  | 'competitor'
  | 'delay'
  | 'min_quantity'
  | 'hard_no'
  | 'trade_in'
  | 'other';

export interface Battlecard {
  competitorName: string;
  ourAdvantages: string[];
  theirWeaknesses: string[];
  talkingPoints: string[];
}

export interface ObjectionHandlerState {
  objectionType: ObjectionType | null;
  treatmentScript: string;
  battlecard: Battlecard | null;
  tradeInOffer: string;
  smallerLotSuggestion: string;
  postNoRecovery: string;
  loading: boolean;
}

export interface UseObjectionHandlerOptions {
  conversationId: string;
  contactId: string;
  messages: Array<{ content: string; sender: string }>;
  enabled?: boolean;
}

export interface ObjectionHandlerActions {
  state: ObjectionHandlerState;
  analyze: (latestMessage: string) => void;
  dismiss: () => void;
}

const EMPTY_STATE: ObjectionHandlerState = {
  objectionType: null,
  treatmentScript: '',
  battlecard: null,
  tradeInOffer: '',
  smallerLotSuggestion: '',
  postNoRecovery: '',
  loading: false,
};

export function useObjectionHandler({
  conversationId,
  contactId,
  messages,
  enabled = true,
}: UseObjectionHandlerOptions): ObjectionHandlerActions {
  const [state, setState] = useState<ObjectionHandlerState>(EMPTY_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const dismiss = useCallback(() => setState(EMPTY_STATE), []);

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
            objectionType?: ObjectionType;
            treatmentScript?: string;
            battlecard?: Battlecard;
            tradeInOffer?: string;
            smallerLotSuggestion?: string;
            postNoRecovery?: string;
          }>('ai-objection-handler', {
            body: {
              conversationId,
              contactId,
              messages: recentMessages,
              latestMessage,
            },
          });

          if (error || !data) {
            log.warn('ai-objection-handler falhou', { msg: error ?? 'sem dados' });
            setState((s) => ({ ...s, loading: false }));
            return;
          }

          setState({
            objectionType: data.objectionType ?? null,
            treatmentScript: data.treatmentScript ?? '',
            battlecard: data.battlecard ?? null,
            tradeInOffer: data.tradeInOffer ?? '',
            smallerLotSuggestion: data.smallerLotSuggestion ?? '',
            postNoRecovery: data.postNoRecovery ?? '',
            loading: false,
          });

          log.info('objeção detectada', { type: data.objectionType });
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            log.warn('useObjectionHandler: erro', { msg: err.message });
          }
          setState((s) => ({ ...s, loading: false }));
        }
      })();
    },
    [enabled, conversationId, contactId, messages],
  );

  return { state, analyze, dismiss };
}
