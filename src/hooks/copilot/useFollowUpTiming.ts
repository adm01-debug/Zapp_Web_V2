/**
 * CV-095 — Melhor momento para o follow-up.
 *
 * Sugere quando retomar o contato com base no horário em que o cliente
 * costuma responder e na data-limite do evento.
 */
import { useMemo } from 'react';

export interface FollowUpTimingOptions {
  /** Timestamps (ms) das respostas anteriores do cliente. */
  clientResponseTimestamps?: number[];
  /** Data do evento (ISO 8601). null = desconhecida. */
  eventDate?: string | null;
  /** Timestamp (ms) da última mensagem do vendedor. null = não houve. */
  lastSellerMessageAt?: number | null;
}

export interface FollowUpTiming {
  /** Horário sugerido para o follow-up (HH:MM no fuso local). */
  suggestedTime: string;
  /** Motivo da sugestão. */
  rationale: string;
  /** Urgência: se faltarem ≤ 3 dias para o prazo reverso, é urgent. */
  isUrgent: boolean;
  /** Quantas horas a esperar antes de follow-up (a partir de agora). */
  waitHours: number;
}

function mostFrequentHour(timestamps: number[]): number | null {
  if (timestamps.length === 0) return null;
  const hourCounts: Record<number, number> = {};
  for (const ts of timestamps) {
    const h = new Date(ts).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  let best = 9;
  let bestCount = 0;
  for (const [h, count] of Object.entries(hourCounts)) {
    if (count > bestCount) { bestCount = count; best = Number(h); }
  }
  return best;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

export function useFollowUpTiming(options: FollowUpTimingOptions): FollowUpTiming {
  const { clientResponseTimestamps = [], eventDate, lastSellerMessageAt } = options;

  return useMemo(() => {
    const now = Date.now();
    const hoursSinceLast = lastSellerMessageAt
      ? (now - lastSellerMessageAt) / 3_600_000
      : 999;

    const eventDaysLeft = eventDate
      ? (new Date(eventDate).getTime() - now) / 86_400_000
      : null;

    const isUrgent = eventDaysLeft !== null && eventDaysLeft <= 3;
    const preferredHour = mostFrequentHour(clientResponseTimestamps) ?? 9;

    let waitHours: number;
    let rationale: string;

    if (isUrgent) {
      waitHours = Math.max(1, Math.min(4, 24 - hoursSinceLast));
      rationale = 'Prazo urgente — follow-up em poucas horas.';
    } else if (hoursSinceLast < 4) {
      waitHours = 4 - hoursSinceLast;
      rationale = 'Aguardando janela mínima de 4 h desde a última mensagem.';
    } else {
      const nextPreferred = new Date();
      nextPreferred.setHours(preferredHour, 0, 0, 0);
      if (nextPreferred.getTime() <= now) nextPreferred.setDate(nextPreferred.getDate() + 1);
      waitHours = (nextPreferred.getTime() - now) / 3_600_000;
      rationale = `Cliente costuma responder por volta das ${pad(preferredHour)}h.`;
    }

    const suggestedTs = now + waitHours * 3_600_000;
    const d = new Date(suggestedTs);
    const suggestedTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    return { suggestedTime, rationale, isUrgent, waitHours: Math.round(waitHours * 10) / 10 };
  }, [clientResponseTimestamps, eventDate, lastSellerMessageAt]);
}
