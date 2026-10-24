/**
 * CV-079 — Phase 8: Loss Risk (ESTENDE IA-156 + useContactIntelligence)
 *
 * CV-079: Combines signals (response time, engagement drop, competitor mention, stall phrases,
 * silence) to compute a 0–100 "venda em risco" score. Score >= triggerThreshold → alert.
 */
import { useState, useCallback, useRef } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useLossRisk');

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface LossRiskSignal {
  type: 'response_time' | 'engagement_drop' | 'competitor_mention' | 'stall_phrase' | 'silence';
  weight: number;
  description: string;
}

export interface LossRiskState {
  riskScore: number;
  riskLevel: RiskLevel;
  signals: LossRiskSignal[];
  recoveryAction: string;
  triggered: boolean;
  loading: boolean;
}

export interface UseLossRiskOptions {
  conversationId: string;
  contactId: string;
  messages: Array<{ content: string; sender: string; timestamp?: string }>;
  /** Score threshold for 'triggered' alert (default: 70) */
  triggerThreshold?: number;
  enabled?: boolean;
}

export interface LossRiskActions {
  state: LossRiskState;
  analyze: () => void;
  dismiss: () => void;
}

const EMPTY_STATE: LossRiskState = {
  riskScore: 0,
  riskLevel: 'low',
  signals: [],
  recoveryAction: '',
  triggered: false,
  loading: false,
};

function scoreToLevel(score: number): RiskLevel {
  if (score >= 85) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export function useLossRisk({
  conversationId,
  contactId,
  messages,
  triggerThreshold = 70,
  enabled = true,
}: UseLossRiskOptions): LossRiskActions {
  const [state, setState] = useState<LossRiskState>(EMPTY_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const dismiss = useCallback(() => setState(EMPTY_STATE), []);

  const analyze = useCallback(() => {
    if (!enabled) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState((s) => ({ ...s, loading: true }));

    void (async () => {
      try {
        const recentMessages = messages.slice(-20).map((m) => ({
          content: m.content,
          sender: m.sender,
          timestamp: m.timestamp,
        }));

        const { data, error } = await invokeEdge<{
          riskScore?: number;
          signals?: LossRiskSignal[];
          recoveryAction?: string;
        }>('ai-loss-risk', {
          body: {
            conversationId,
            contactId,
            messages: recentMessages,
            triggerThreshold,
          },
        });

        if (error || !data) {
          log.warn('ai-loss-risk falhou', { msg: error ?? 'sem dados' });
          setState((s) => ({ ...s, loading: false }));
          return;
        }

        const score = data.riskScore ?? 0;
        const riskLevel = scoreToLevel(score);
        const triggered = score >= triggerThreshold;

        if (triggered) {
          log.info('venda em risco detectada', { score, riskLevel });
        }

        setState({
          riskScore: score,
          riskLevel,
          signals: data.signals ?? [],
          recoveryAction: data.recoveryAction ?? '',
          triggered,
          loading: false,
        });
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          log.warn('useLossRisk: erro', { msg: err.message });
        }
        setState((s) => ({ ...s, loading: false }));
      }
    })();
  }, [enabled, conversationId, contactId, messages, triggerThreshold]);

  return { state, analyze, dismiss };
}
