/**
 * CV-141 — Dashboard de custo do copilot.
 *
 * Agrega métricas de uso de IA para controle de custo e ROI.
 */
import { useMemo } from 'react';

export interface CopilotCostMetrics {
  totalTokensUsed: number;
  estimatedCostBrl: number;
  suggestionsGenerated: number;
  suggestionsUsed: number;
  adoptionRate: number;
}

const BRL_PER_1K_TOKENS = 0.02;

export function useCostDashboard({
  sessions,
}: {
  sessions: Array<{ tokensUsed: number; suggestionsGenerated: number; suggestionsUsed: number }>;
}): CopilotCostMetrics {
  return useMemo(() => {
    const totalTokensUsed = sessions.reduce((s, r) => s + r.tokensUsed, 0);
    const suggestionsGenerated = sessions.reduce((s, r) => s + r.suggestionsGenerated, 0);
    const suggestionsUsed = sessions.reduce((s, r) => s + r.suggestionsUsed, 0);
    const estimatedCostBrl = (totalTokensUsed / 1000) * BRL_PER_1K_TOKENS;
    const adoptionRate = suggestionsGenerated > 0 ? suggestionsUsed / suggestionsGenerated : 0;
    return { totalTokensUsed, estimatedCostBrl, suggestionsGenerated, suggestionsUsed, adoptionRate };
  }, [sessions]);
}
