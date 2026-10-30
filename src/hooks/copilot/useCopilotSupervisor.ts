/**
 * CV-121 — Supervisor do copiloto — prioriza insights visíveis (máx. 2).
 */
import { useMemo } from 'react';

export type InsightPriority = 'critical' | 'high' | 'medium' | 'low';
export type InsightSource = 'objection' | 'purchase_signal' | 'speed_to_lead' | 'guardrail' | 'silence' | 'loss_risk' | 'discount_guardrail' | 'deadline';

export interface CopilotInsight {
  source: InsightSource;
  priority: InsightPriority;
  message: string;
  action?: string;
}

export interface SupervisorResult {
  activeInsights: CopilotInsight[];
  totalInsights: number;
}

const PRIORITY_ORDER: InsightPriority[] = ['critical', 'high', 'medium', 'low'];

export function useCopilotSupervisor({ insights, maxVisible = 2 }: { insights: CopilotInsight[]; maxVisible?: number }): SupervisorResult {
  return useMemo(() => {
    if (!insights.length) return { activeInsights: [], totalInsights: 0 };
    const sorted = [...insights].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));
    return { activeInsights: sorted.slice(0, maxVisible), totalInsights: insights.length };
  }, [insights, maxVisible]);
}
