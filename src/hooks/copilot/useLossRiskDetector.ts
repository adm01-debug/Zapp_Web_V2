/**
 * CV-079 — Detector de risco de perda de venda.
 *
 * Identifica sinais de que o cliente pode estar desistindo ou indo para concorrente.
 */
import { useMemo } from 'react';

export type LossRiskLevel = 'low' | 'medium' | 'high';

export interface LossRiskResult {
  level: LossRiskLevel;
  signals: string[];
  recoveryAction: string;
}

const HIGH_RISK = ['vou cancelar', 'desisti', 'não vai dar', 'fechei com outro', 'já comprei em outro', 'obrigado mesmo assim'];
const MEDIUM_RISK = ['vou pensar', 'preciso ver', 'cotei em outro', 'comparando', 'não tenho certeza', 'caro demais'];
const LOW_RISK = ['semana que vem', 'depois', 'mais tarde', 'em breve'];

export function useLossRiskDetector({
  clientText,
  daysSinceLastContact,
}: {
  clientText: string;
  daysSinceLastContact?: number;
}): LossRiskResult {
  return useMemo(() => {
    if (!clientText && !daysSinceLastContact) return { level: 'low', signals: [], recoveryAction: '' };
    const lower = (clientText ?? '').toLowerCase();
    const silenceRisk = (daysSinceLastContact ?? 0) > 5;

    const highMatches = HIGH_RISK.filter((s) => lower.includes(s));
    const medMatches = MEDIUM_RISK.filter((s) => lower.includes(s));
    const lowMatches = LOW_RISK.filter((s) => lower.includes(s));

    if (highMatches.length > 0) {
      return { level: 'high', signals: highMatches, recoveryAction: 'Ligue agora. Pergunte o que faltou e faça uma oferta de recuperação única.' };
    }
    if (medMatches.length > 0 || silenceRisk) {
      return {
        level: 'medium',
        signals: [...medMatches, ...(silenceRisk ? ['silêncio > 5 dias'] : [])],
        recoveryAction: 'Envie proposta revisada com benefício adicional. Crie urgência com data de validade.',
      };
    }
    return { level: 'low', signals: lowMatches, recoveryAction: 'Agende follow-up para o prazo que o cliente mencionou.' };
  }, [clientText, daysSinceLastContact]);
}
