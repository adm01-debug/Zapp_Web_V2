/**
 * CV-083 to CV-087 — Phase 9: Deadline Calculator
 *
 * CV-083 (ESTENDE IA-155): Reverse deadline — given event date, computes latest order date.
 * CV-084: Honest urgency — shows genuine deadline with production/shipping breakdown.
 * CV-085 (DELEGADA IA-155): Impossible deadline alert — when IA flags infeasible date.
 * CV-086: Quote draft — auto-generates quote structure from conversation context.
 * CV-087: Freight estimate — estimates shipping cost/time based on qty+destination.
 */
import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useDeadlineCalculator');

export interface DeadlineBreakdown {
  productionDays: number;
  shippingDays: number;
  bufferDays: number;
  latestOrderDate: string;
  eventDate: string;
  feasible: boolean;
}

export interface FreightEstimate {
  minDays: number;
  maxDays: number;
  estimatedCost: string;
  carrier: string;
}

export interface QuoteDraft {
  productName: string;
  quantity: number;
  unitPrice: string;
  total: string;
  notes: string;
}

export interface DeadlineCalculatorState {
  deadline: DeadlineBreakdown | null;
  impossibleDeadline: boolean;
  impossibleReason: string;
  quoteDraft: QuoteDraft | null;
  freightEstimate: FreightEstimate | null;
  loading: boolean;
}

export interface UseDeadlineCalculatorOptions {
  conversationId: string;
  contactId: string;
  messages: Array<{ content: string; sender: string }>;
  enabled?: boolean;
}

export interface DeadlineCalculatorActions {
  state: DeadlineCalculatorState;
  analyze: (latestMessage: string) => void;
  dismiss: () => void;
}

const EMPTY_STATE: DeadlineCalculatorState = {
  deadline: null,
  impossibleDeadline: false,
  impossibleReason: '',
  quoteDraft: null,
  freightEstimate: null,
  loading: false,
};

export function useDeadlineCalculator({
  conversationId,
  contactId,
  messages,
  enabled = true,
}: UseDeadlineCalculatorOptions): DeadlineCalculatorActions {
  const [state, setState] = useState<DeadlineCalculatorState>(EMPTY_STATE);
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
            deadline?: DeadlineBreakdown;
            impossibleDeadline?: boolean;
            impossibleReason?: string;
            quoteDraft?: QuoteDraft;
            freightEstimate?: FreightEstimate;
          }>('ai-deadline-calculator', {
            body: {
              conversationId,
              contactId,
              messages: recentMessages,
              latestMessage,
            },
          });

          if (error || !data) {
            log.warn('ai-deadline-calculator falhou', { msg: error ?? 'sem dados' });
            setState((s) => ({ ...s, loading: false }));
            return;
          }

          if (data.impossibleDeadline) {
            log.warn('prazo impossível detectado', { reason: data.impossibleReason });
          }

          setState({
            deadline: data.deadline ?? null,
            impossibleDeadline: data.impossibleDeadline ?? false,
            impossibleReason: data.impossibleReason ?? '',
            quoteDraft: data.quoteDraft ?? null,
            freightEstimate: data.freightEstimate ?? null,
            loading: false,
          });
        } catch (err) {
          if (err instanceof Error && err.name !== 'AbortError') {
            log.warn('useDeadlineCalculator: erro', { msg: err.message });
          }
          setState((s) => ({ ...s, loading: false }));
        }
      })();
    },
    [enabled, conversationId, contactId, messages],
  );

  return { state, analyze, dismiss };
}
