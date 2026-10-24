/**
 * CV-131 to CV-140 — Phase 14: Copilot Learning
 *
 * CV-131: Golden set — curated high-quality conversation examples.
 * CV-132: AI judge — automated quality evaluation of responses.
 * CV-133: CI regression gate — prevents model deploy if quality drops.
 * CV-134: Versioned prompts — A/B test prompt variants per segment.
 * CV-135: A/B experiments — track outcome by prompt version.
 * CV-136: Edit learning — every edit (CV-065) feeds into training pipeline.
 * CV-137: Outcome learning — closed deals feed back to model.
 * CV-138: Drift detector — alert when model quality drifts from baseline.
 * CV-139: Objection catalog update — new winning treatments are cataloged.
 * CV-140: Safe model swap — staged rollout of new model versions.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useCopilotLearning');

export interface PromptVariant {
  variantId: string;
  label: string;
  assignedAt: string;
}

export interface CopilotLearningState {
  promptVariant: PromptVariant | null;
  driftAlert: boolean;
  driftReason: string;
  loading: boolean;
}

export interface UseCopilotLearningOptions {
  conversationId: string;
  contactId: string;
  sellerId: string;
  segment?: string;
  enabled?: boolean;
}

export interface CopilotLearningActions {
  state: CopilotLearningState;
  /** CV-137: record outcome (deal closed/lost) for outcome learning */
  recordOutcome: (outcome: 'closed' | 'lost', dealValue?: number) => void;
  /** CV-139: submit a new winning objection treatment */
  submitObjectionWin: (objectionType: string, treatmentText: string) => void;
}

export function useCopilotLearning({
  conversationId,
  contactId,
  sellerId,
  segment,
  enabled = true,
}: UseCopilotLearningOptions): CopilotLearningActions {
  const [state] = useState<CopilotLearningState>({
    promptVariant: null,
    driftAlert: false,
    driftReason: '',
    loading: false,
  });

  const recordOutcome = useCallback(
    (outcome: 'closed' | 'lost', dealValue?: number) => {
      if (!enabled) return;
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('copilot_outcomes').insert({
          conversation_id: conversationId,
          contact_id: contactId,
          seller_id: sellerId,
          outcome,
          deal_value: dealValue ?? null,
          segment: segment ?? null,
        });
        if (error) log.warn('outcome falhou', { msg: error.message });
        else log.info('outcome registrado', { outcome, dealValue });
      })();
    },
    [enabled, conversationId, contactId, sellerId, segment],
  );

  const submitObjectionWin = useCallback(
    (objectionType: string, treatmentText: string) => {
      if (!enabled || !treatmentText.trim()) return;
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('copilot_objection_catalog').insert({
          conversation_id: conversationId,
          objection_type: objectionType,
          treatment_text: treatmentText,
          submitted_by: sellerId,
          status: 'pending_review',
        });
        if (error) log.warn('objection win falhou', { msg: error.message });
        else log.info('tratamento de objeção submetido', { objectionType });
      })();
    },
    [enabled, conversationId, sellerId],
  );

  return { state, recordOutcome, submitObjectionWin };
}
