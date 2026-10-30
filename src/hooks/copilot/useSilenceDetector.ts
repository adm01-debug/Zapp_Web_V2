/**
 * CV-096 — Detector de silêncio do cliente.
 *
 * Avisa quando o cliente ficou muito tempo sem responder e sugere como reativar.
 */
import { useMemo } from 'react';

export interface SilenceDetectorResult {
  isSilent: boolean;
  daysSilent: number;
  riskLevel: 'low' | 'medium' | 'high';
  reactivationScript: string;
}

export function useSilenceDetector({
  lastClientMessageAt,
  now = 0,
}: {
  lastClientMessageAt: Date | null;
  /** Current timestamp in ms; pass Date.now() from the caller. */
  now?: number;
}): SilenceDetectorResult {
  return useMemo(() => {
    if (!lastClientMessageAt) return { isSilent: false, daysSilent: 0, riskLevel: 'low', reactivationScript: '' };
    const daysSilent = Math.floor((now - lastClientMessageAt.getTime()) / 86_400_000);
    if (daysSilent < 2) return { isSilent: false, daysSilent, riskLevel: 'low', reactivationScript: '' };

    let riskLevel: 'low' | 'medium' | 'high';
    let reactivationScript: string;

    if (daysSilent >= 7) {
      riskLevel = 'high';
      reactivationScript = `Oi! Faz ${daysSilent} dias desde nosso contato. Sei que as coisas ficam corridas — se precisar de brindes no futuro, pode contar comigo!`;
    } else if (daysSilent >= 3) {
      riskLevel = 'medium';
      reactivationScript = 'Oi! Passando para verificar se ficou alguma dúvida sobre a nossa conversa. Posso ajudar em algo?';
    } else {
      riskLevel = 'low';
      reactivationScript = 'Oi! Tudo bem? Vi que não chegou resposta. Está esperando alguma informação da minha parte?';
    }

    return { isSilent: true, daysSilent, riskLevel, reactivationScript };
  }, [lastClientMessageAt, now]);
}
