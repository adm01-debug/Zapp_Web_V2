/**
 * CV-065, CV-066 — Feedback implícito (distância de edição) e explícito (thumbs).
 *
 * CV-065: ao enviar mensagem que partiu de uma sugestão do copiloto, mede a
 *   distância de Levenshtein entre a sugestão original e o texto enviado.
 *   Classifica como "igual" (0%), "pouco" (≤30%) ou "muito" (>30%).
 *
 * CV-066: thumbs up/down com motivo opcional ("Errou fato", "Tom errado",
 *   "Fora de hora", "Genérica"). Registra em `copilot_feedback`.
 */
import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('useCopilotFeedback');

export type EditLevel = 'igual' | 'pouco' | 'muito';
export type FeedbackRating = 'positive' | 'negative';
export type FeedbackReason = 'errou_fato' | 'tom_errado' | 'fora_de_hora' | 'generica' | string;

export interface UseCopilotFeedbackOptions {
  conversationId: string;
  contactId: string;
}

export interface CopilotFeedbackActions {
  /** Registra distância de edição entre sugestão e texto enviado. */
  recordEditDistance: (suggestion: string, sent: string) => void;
  /** Registra feedback explícito (thumbs up/down). */
  recordFeedback: (suggestionId: string, rating: FeedbackRating, reason?: FeedbackReason) => void;
  /** Classifica a edição como 'igual', 'pouco' ou 'muito'. */
  classifyEdit: (suggestion: string, sent: string) => EditLevel;
}

/** Distância de Levenshtein O(n·m). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function classifyEdit(suggestion: string, sent: string): EditLevel {
  if (!suggestion) return 'igual';
  if (suggestion === sent) return 'igual';
  const dist = levenshtein(suggestion, sent);
  const ratio = dist / Math.max(suggestion.length, sent.length, 1);
  if (ratio <= 0.3) return 'pouco';
  return 'muito';
}

export function useCopilotFeedback({
  conversationId,
  contactId,
}: UseCopilotFeedbackOptions): CopilotFeedbackActions {
  const recordEditDistance = useCallback(
    (suggestion: string, sent: string) => {
      if (!suggestion) return;
      const level = classifyEdit(suggestion, sent);
      void (async () => {
        try {
          const { error } = await supabase.from('copilot_feedback').insert({
            conversation_id: conversationId,
            contact_id: contactId,
            feedback_type: 'edit_distance',
            edit_level: level,
            suggestion_text: suggestion,
            sent_text: sent,
          });
          if (error) {
            log.warn('copilot_feedback insert falhou (edit_distance)', { msg: error.message });
          } else {
            log.info('edit_distance registrado', { level });
          }
        } catch (err) {
          log.warn('copilot_feedback indisponível', { msg: (err as Error).message });
        }
      })();
    },
    [conversationId, contactId],
  );

  const recordFeedback = useCallback(
    (suggestionId: string, rating: FeedbackRating, reason?: FeedbackReason) => {
      void (async () => {
        try {
          const { error } = await supabase.from('copilot_feedback').insert({
            conversation_id: conversationId,
            contact_id: contactId,
            feedback_type: 'thumbs',
            suggestion_id: suggestionId,
            rating,
            reason: reason ?? null,
          });
          if (error) {
            log.warn('copilot_feedback insert falhou (thumbs)', { msg: error.message });
          } else {
            log.info('thumbs registrado', { rating, reason });
          }
        } catch (err) {
          log.warn('copilot_feedback indisponível', { msg: (err as Error).message });
        }
      })();
    },
    [conversationId, contactId],
  );

  return {
    recordEditDistance,
    recordFeedback,
    classifyEdit: (s, t) => classifyEdit(s, t),
  };
}
