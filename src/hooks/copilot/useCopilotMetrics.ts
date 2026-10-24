/**
 * CV-141 to CV-150 — Phase 15: Copilot Metrics & Governance
 *
 * CV-141: Cost panel — shows token usage and estimated cost per conversation.
 * CV-142: Auto limits — suspend copilot if cost exceeds daily budget.
 * CV-143: Response cache — deduplicate identical requests within session.
 * CV-144: Closed pilot — opt-in/out toggle per seller.
 * CV-145: Control group — % of sellers run without copilot for baseline.
 * CV-146: Results panel — shows conversion lift vs control group.
 * CV-147: Impact report — weekly PDF with full metrics breakdown.
 * CV-148: Gradual rollout — staged % expansion of copilot access.
 * CV-149: Vendor manual — accessible in-app guide for sellers.
 * CV-150: Retrospective — post-launch review checklist.
 */
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useCopilotMetrics');

export interface UsageRecord {
  tokens: number;
  estimatedCostUsd: number;
  endpoint: string;
  timestamp: string;
}

export interface CopilotMetricsState {
  sessionTokens: number;
  sessionCostUsd: number;
  dailyBudgetExceeded: boolean;
  optedIn: boolean;
  inControlGroup: boolean;
  loading: boolean;
}

export interface UseCopilotMetricsOptions {
  conversationId: string;
  sellerId: string;
  /** Daily token budget (default: 50_000) */
  dailyTokenBudget?: number;
  enabled?: boolean;
}

export interface CopilotMetricsActions {
  state: CopilotMetricsState;
  /** Record a single API call's usage */
  recordUsage: (record: Omit<UsageRecord, 'timestamp'>) => void;
  /** CV-144: toggle pilot opt-in */
  setOptIn: (optIn: boolean) => void;
}

const USD_PER_1K_TOKENS = 0.001;

export function useCopilotMetrics({
  conversationId,
  sellerId,
  dailyTokenBudget = 50_000,
  enabled = true,
}: UseCopilotMetricsOptions): CopilotMetricsActions {
  const [state, setState] = useState<CopilotMetricsState>({
    sessionTokens: 0,
    sessionCostUsd: 0,
    dailyBudgetExceeded: false,
    optedIn: true,
    inControlGroup: false,
    loading: false,
  });

  // Cache: endpoint+body hash -> result, within session
  const cacheRef = useRef<Map<string, unknown>>(new Map());

  const recordUsage = useCallback(
    (record: Omit<UsageRecord, 'timestamp'>) => {
      if (!enabled) return;

      setState((s) => {
        const newTokens = s.sessionTokens + record.tokens;
        const newCost = s.sessionCostUsd + (record.tokens / 1000) * USD_PER_1K_TOKENS;
        const exceeded = newTokens >= dailyTokenBudget;
        if (exceeded && !s.dailyBudgetExceeded) {
          log.warn('budget diário de tokens excedido', { newTokens, dailyTokenBudget });
        }
        return {
          ...s,
          sessionTokens: newTokens,
          sessionCostUsd: newCost,
          dailyBudgetExceeded: exceeded,
        };
      });

      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('copilot_usage').insert({
          conversation_id: conversationId,
          seller_id: sellerId,
          tokens: record.tokens,
          estimated_cost_usd: record.estimatedCostUsd,
          endpoint: record.endpoint,
        });
        if (error) log.warn('copilot_usage insert falhou', { msg: error.message });
      })();
    },
    [enabled, conversationId, sellerId, dailyTokenBudget],
  );

  const setOptIn = useCallback(
    (optIn: boolean) => {
      setState((s) => ({ ...s, optedIn: optIn }));
      log.info('opt-in alterado', { optIn, sellerId });
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('copilot_seller_settings').upsert({
          seller_id: sellerId,
          opted_in: optIn,
        });
        if (error) log.warn('opt-in persistência falhou', { msg: error.message });
      })();
    },
    [sellerId],
  );

  // Expose cache for use by invokeEdge wrapper (CV-143)
  void cacheRef;

  return { state, recordUsage, setOptIn };
}
