/**
 * CV-121 — Supervisor do copiloto.
 *
 * Agrega os outputs de todos os hooks de fase 8-12 e decide
 * qual insight tem prioridade de exibição para não sobrecarregar
 * o vendedor com informações simultâneas.
 * Máximo de 2 insights ativos por vez.
 */
import { useMemo } from 'react';

export type InsightPriority = 'critical' | 'high' | 'medium' | 'low';
export type InsightSource =
  | 'objection'
  | 'purchase_signal'
  | 'speed_to_lead'
  | 'guardrail'
  | 'silence'
  | 'loss_risk'
  | 'discount_guardrail'
  | 'deadline';

export interface CopilotInsight {
  source: InsightSource;
  priority: InsightPriority;
  message: string;
  action?: string;
}

export interface SupervisorResult {
  /** Insights priorizados para exibição (máx. 2). */
  activeInsights: CopilotInsight[];
  /** Total de insights disponíveis (incluindo suprimidos). */
  totalInsights: number;
}

const PRIORITY_ORDER: InsightPriority[] = ['critical', 'high', 'medium', 'low'];

export interface UseCopilotSupervisorOptions {
  insights: CopilotInsight[];
  maxVisible?: number;
}

export function useCopilotSupervisor({
  insights,
  maxVisible = 2,
}: UseCopilotSupervisorOptions): SupervisorResult {
  return useMemo(() => {
    if (!insights.length) return { activeInsights: [], totalInsights: 0 };

    const sorted = [...insights].sort(
      (a, b) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
    );

    return {
      activeInsights: sorted.slice(0, maxVisible),
      totalInsights: insights.length,
    };
  }, [insights, maxVisible]);
}
