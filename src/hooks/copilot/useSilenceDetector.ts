/**
 * CV-098 — Detector de silêncio.
 *
 * Cliente quente que parou de responder entra na lista "esfriando" com
 * sugestão de retomada. Lista ordenada por valor × temperatura.
 */
import { useMemo } from 'react';

export interface SilentLead {
  conversationId: string;
  contactName: string;
  temperatureScore: number;
  estimatedValue?: number | null;
  lastClientMessageAt: number;
  silenceHours: number;
  /** Prioridade calculada: estimatedValue × temperatureScore. */
  priority: number;
  retakeSuggestion: string;
}

export interface SilentLeadInput {
  conversationId: string;
  contactName: string;
  temperatureScore: number;
  estimatedValue?: number | null;
  lastClientMessageAt: number | null;
  lastSellerMessageAt: number | null;
}

export interface UseSilenceDetectorOptions {
  leads: SilentLeadInput[];
  /** Horas de silêncio para considerar esfriando (padrão 4). */
  silenceThresholdHours?: number;
  /** Score mínimo de temperatura para entrar na lista (padrão 40). */
  minTemperature?: number;
}

const DEFAULT_THRESHOLD = 4;
const DEFAULT_MIN_TEMP = 40;

function buildSuggestion(silenceHours: number, temperature: number): string {
  if (silenceHours > 24) return 'Mais de 24 h sem resposta — envie algo novo (mockup, prazo, ideia).';
  if (temperature >= 75) return 'Lead quente silencioso — contate agora com elemento de valor.';
  return 'Lead esfriando — retome com follow-up relevante.';
}

export function useSilenceDetector({
  leads,
  silenceThresholdHours = DEFAULT_THRESHOLD,
  minTemperature = DEFAULT_MIN_TEMP,
}: UseSilenceDetectorOptions): SilentLead[] {
  return useMemo(() => {
    const now = Date.now();
    const result: SilentLead[] = [];

    for (const lead of leads) {
      if (lead.temperatureScore < minTemperature) continue;
      if (lead.lastClientMessageAt === null) continue;

      const silenceHours = (now - lead.lastClientMessageAt) / 3_600_000;
      if (silenceHours < silenceThresholdHours) continue;

      const lastSellerAfterClient =
        lead.lastSellerMessageAt !== null &&
        lead.lastSellerMessageAt > lead.lastClientMessageAt;
      if (lastSellerAfterClient) continue;

      const value = lead.estimatedValue ?? 0;
      const priority = value > 0
        ? value * lead.temperatureScore
        : lead.temperatureScore * 100;

      result.push({
        conversationId: lead.conversationId,
        contactName: lead.contactName,
        temperatureScore: lead.temperatureScore,
        estimatedValue: lead.estimatedValue,
        lastClientMessageAt: lead.lastClientMessageAt,
        silenceHours: Math.round(silenceHours * 10) / 10,
        priority,
        retakeSuggestion: buildSuggestion(silenceHours, lead.temperatureScore),
      });
    }

    return result.sort((a, b) => b.priority - a.priority);
  }, [leads, silenceThresholdHours, minTemperature]);
}
