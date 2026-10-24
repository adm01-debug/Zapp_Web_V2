/**
 * CV-121 to CV-130 — Phase 13: Supervisor Features
 *
 * CV-121: Control tower — supervisor view of all active copilot sessions.
 * CV-122: Supervisor whisper — supervisor injects hint visible only to seller.
 * CV-123: Help request — seller escalates conversation to supervisor.
 * CV-124: Scoring — supervisor rates conversation quality 1-5.
 * CV-125: Learning moment — supervisor tags a message as training example.
 * CV-126: Role-play — supervisor simulates contact for training.
 * CV-127: Apprentice mode — new seller sees supervisor's full reply draft.
 * CV-128: Ranking — weekly seller ranking by copilot metrics.
 * CV-129: Weekly report — automated PDF performance summary.
 * CV-130: Winning library — shared repo of best conversation segments.
 */
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useSupervisorFeatures');

export interface SupervisorWhisper {
  id: string;
  hint: string;
  supervisorId: string;
  createdAt: string;
}

export interface LearningMoment {
  messageId: string;
  tag: 'exemplar' | 'anti_pattern' | 'objection_win' | 'closing_technique';
  notes: string;
}

export interface SupervisorFeaturesState {
  whispers: SupervisorWhisper[];
  helpRequested: boolean;
  conversationScore: number | null;
  apprenticeMode: boolean;
  loading: boolean;
}

export interface UseSupervisorFeaturesOptions {
  conversationId: string;
  contactId: string;
  sellerId: string;
  isSupervisor?: boolean;
  enabled?: boolean;
}

export interface SupervisorFeaturesActions {
  state: SupervisorFeaturesState;
  requestHelp: () => void;
  dismissHelp: () => void;
  tagLearningMoment: (moment: LearningMoment) => void;
  scoreConversation: (score: number) => void;
  toggleApprenticeMode: () => void;
  dismissWhisper: (id: string) => void;
}

export function useSupervisorFeatures({
  conversationId,
  contactId,
  sellerId,
  isSupervisor = false,
  enabled = true,
}: UseSupervisorFeaturesOptions): SupervisorFeaturesActions {
  const [state, setState] = useState<SupervisorFeaturesState>({
    whispers: [],
    helpRequested: false,
    conversationScore: null,
    apprenticeMode: false,
    loading: false,
  });

  const requestHelp = useCallback(() => {
    if (!enabled) return;
    setState((s) => ({ ...s, helpRequested: true }));
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('copilot_help_requests').insert({
        conversation_id: conversationId,
        contact_id: contactId,
        seller_id: sellerId,
      });
      if (error) log.warn('help request falhou', { msg: error.message });
      else log.info('ajuda solicitada ao supervisor');
    })();
  }, [enabled, conversationId, contactId, sellerId]);

  const dismissHelp = useCallback(() =>
    setState((s) => ({ ...s, helpRequested: false })), []);

  const tagLearningMoment = useCallback(
    (moment: LearningMoment) => {
      if (!enabled) return;
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('copilot_learning_moments').insert({
          conversation_id: conversationId,
          message_id: moment.messageId,
          tag: moment.tag,
          notes: moment.notes,
          tagged_by: sellerId,
        });
        if (error) log.warn('learning moment falhou', { msg: error.message });
        else log.info('momento de aprendizado registrado', { tag: moment.tag });
      })();
    },
    [enabled, conversationId, sellerId],
  );

  const scoreConversation = useCallback(
    (score: number) => {
      if (!enabled || !isSupervisor) return;
      const clamped = Math.max(1, Math.min(5, score));
      setState((s) => ({ ...s, conversationScore: clamped }));
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('copilot_conversation_scores').upsert({
          conversation_id: conversationId,
          score: clamped,
          scored_by: sellerId,
        });
        if (error) log.warn('score falhou', { msg: error.message });
        else log.info('conversa pontuada', { score: clamped });
      })();
    },
    [enabled, isSupervisor, conversationId, sellerId],
  );

  const toggleApprenticeMode = useCallback(() =>
    setState((s) => ({ ...s, apprenticeMode: !s.apprenticeMode })), []);

  const dismissWhisper = useCallback(
    (id: string) =>
      setState((s) => ({ ...s, whispers: s.whispers.filter((w) => w.id !== id) })),
    [],
  );

  return {
    state,
    requestHelp,
    dismissHelp,
    tagLearningMoment,
    scoreConversation,
    toggleApprenticeMode,
    dismissWhisper,
  };
}
