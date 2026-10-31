/**
 * CV-097 — Follow-up não-irritante.
 *
 * Limita a frequência de follow-ups para não virar spam.
 * Backoff exponencial: 1d → 3d → 7d → 14d → 30d.
 */
import { useMemo } from 'react';

export interface FollowUpPolicy {
  canFollowUp: boolean;
  attemptCount: number;
  nextFollowUpAfterHours: number;
  shouldArchive: boolean;
  message: string;
}

const BACKOFF_HOURS = [24, 72, 168, 336, 720];

export interface UseNonAnnoyingFollowUpOptions {
  previousFollowUpTimestamps: number[];
  lastClientResponseAt: number | null;
  /** Current timestamp in ms; pass Date.now() from the caller. */
  now?: number;
}

export function useNonAnnoyingFollowUp({
  previousFollowUpTimestamps,
  lastClientResponseAt,
  now = 0,
}: UseNonAnnoyingFollowUpOptions): FollowUpPolicy {
  return useMemo(() => {
    const attemptCount = previousFollowUpTimestamps.length;

    if (lastClientResponseAt) {
      const lastAttempt = Math.max(...previousFollowUpTimestamps, 0);
      if (lastClientResponseAt > lastAttempt) {
        return { canFollowUp: false, attemptCount: 0, nextFollowUpAfterHours: 0, shouldArchive: false, message: 'Cliente respondeu — sem necessidade de follow-up.' };
      }
    }

    if (attemptCount >= 5) {
      return {
        canFollowUp: false,
        attemptCount,
        nextFollowUpAfterHours: 0,
        shouldArchive: true,
        message: '5 tentativas sem resposta — arquivar este lead e voltar em 60 dias.',
      };
    }

    const hoursRequired = BACKOFF_HOURS[attemptCount] ?? BACKOFF_HOURS[BACKOFF_HOURS.length - 1];
    const lastAttemptAt = previousFollowUpTimestamps.length
      ? Math.max(...previousFollowUpTimestamps)
      : 0;
    const hoursElapsed = (now - lastAttemptAt) / 3600000;

    const canFollowUp = hoursElapsed >= hoursRequired;

    return {
      canFollowUp,
      attemptCount,
      nextFollowUpAfterHours: canFollowUp ? 0 : Math.ceil(hoursRequired - hoursElapsed),
      shouldArchive: false,
      message: canFollowUp
        ? `${attemptCount + 1}ª tentativa — pronto para follow-up.`
        : `Aguarde ${Math.ceil(hoursRequired - hoursElapsed)}h antes da próxima tentativa.`,
    };
  }, [previousFollowUpTimestamps, lastClientResponseAt, now]);
}
