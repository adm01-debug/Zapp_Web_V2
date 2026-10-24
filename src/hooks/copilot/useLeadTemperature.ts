/**
 * CV-091 to CV-098 — Phase 10: Lead Temperature
 *
 * CV-091 (ESTENDE IA-113+useContactIntelligence): 0–100 temperature score.
 * CV-092: Buying signals — explicit purchase-intent signals in conversation.
 * CV-093: Speed to lead — optimal response window for this lead type.
 * CV-094: Perfect first response — structure guidance for first reply.
 * CV-095: Follow-up timing — when to follow up based on signals.
 * CV-096: Follow-up content — what angle to use in follow-up.
 * CV-097: WhatsApp 24h — alert when nearing the 24-hour messaging window.
 * CV-098: Silence detector — alert when lead goes silent beyond threshold.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { invokeEdge } from '@/lib/invokeEdge';
import { createLogger } from '@/lib/logger';

const log = createLogger('useLeadTemperature');

export type TemperatureLabel = 'cold' | 'warm' | 'hot' | 'burning';

export interface BuyingSignal {
  type: 'urgency' | 'budget_confirmed' | 'decision_authority' | 'specific_need' | 'timeline';
  excerpt: string;
  strength: 'weak' | 'moderate' | 'strong';
}

export interface FollowUpRecommendation {
  suggestedAt: string;
  delayHours: number;
  angle: string;
  template: string;
}

export interface LeadTemperatureState {
  score: number;
  label: TemperatureLabel;
  signals: BuyingSignal[];
  speedToLeadMinutes: number | null;
  firstResponseStructure: string;
  followUp: FollowUpRecommendation | null;
  whatsapp24hWarning: boolean;
  silenceAlertMinutes: number | null;
  loading: boolean;
}

export interface UseLeadTemperatureOptions {
  conversationId: string;
  contactId: string;
  messages: Array<{ content: string; sender: string; timestamp?: string }>;
  /** Last message timestamp ISO string */
  lastMessageAt?: string;
  /** Silence alert threshold in minutes (default 60) */
  silenceThresholdMinutes?: number;
  enabled?: boolean;
}

export interface LeadTemperatureActions {
  state: LeadTemperatureState;
  analyze: () => void;
  dismiss: () => void;
}

const EMPTY_STATE: LeadTemperatureState = {
  score: 0,
  label: 'cold',
  signals: [],
  speedToLeadMinutes: null,
  firstResponseStructure: '',
  followUp: null,
  whatsapp24hWarning: false,
  silenceAlertMinutes: null,
  loading: false,
};

function scoreToLabel(score: number): TemperatureLabel {
  if (score >= 80) return 'burning';
  if (score >= 55) return 'hot';
  if (score >= 30) return 'warm';
  return 'cold';
}

export function useLeadTemperature({
  conversationId,
  contactId,
  messages,
  lastMessageAt,
  silenceThresholdMinutes = 60,
  enabled = true,
}: UseLeadTemperatureOptions): LeadTemperatureActions {
  const [state, setState] = useState<LeadTemperatureState>(EMPTY_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const dismiss = useCallback(() => setState(EMPTY_STATE), []);

  // CV-097: check 24h window on mount/update
  useEffect(() => {
    if (!lastMessageAt || !enabled) return;
    const elapsed = (Date.now() - new Date(lastMessageAt).getTime()) / 60_000;
    const warn = elapsed >= 23 * 60 && elapsed < 24 * 60;
    setState((s) => ({ ...s, whatsapp24hWarning: warn }));
  }, [lastMessageAt, enabled]);

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
          score?: number;
          signals?: BuyingSignal[];
          speedToLeadMinutes?: number;
          firstResponseStructure?: string;
          followUp?: FollowUpRecommendation;
          silenceAlertMinutes?: number;
        }>('ai-lead-temperature', {
          body: {
            conversationId,
            contactId,
            messages: recentMessages,
            silenceThresholdMinutes,
          },
        });

        if (error || !data) {
          log.warn('ai-lead-temperature falhou', { msg: error ?? 'sem dados' });
          setState((s) => ({ ...s, loading: false }));
          return;
        }

        const score = data.score ?? 0;
        setState((s) => ({
          ...s,
          score,
          label: scoreToLabel(score),
          signals: data.signals ?? [],
          speedToLeadMinutes: data.speedToLeadMinutes ?? null,
          firstResponseStructure: data.firstResponseStructure ?? '',
          followUp: data.followUp ?? null,
          silenceAlertMinutes: data.silenceAlertMinutes ?? null,
          loading: false,
        }));

        log.info('temperatura calculada', { score, label: scoreToLabel(score) });
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          log.warn('useLeadTemperature: erro', { msg: err.message });
        }
        setState((s) => ({ ...s, loading: false }));
      }
    })();
  }, [enabled, conversationId, contactId, messages, silenceThresholdMinutes]);

  return { state, analyze, dismiss };
}
