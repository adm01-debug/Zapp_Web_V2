/**
 * CV-121 — Insights do supervisor (stub).
 *
 * Agrega métricas de performance do vendedor para visão do supervisor.
 * Integração com banco (copilot_sessions/insights) delegada.
 */
import { useMemo } from 'react';

export interface SupervisorInsight {
  vendedorId: string;
  adoptionRate: number;
  avgResponseTime: number;
  objectionHandledCount: number;
  discountGuardrailTriggered: number;
  periodDays: number;
}

export function useSupervisorInsights({
  sessions,
}: {
  sessions: Array<{
    vendedorId: string;
    suggestionsUsed: number;
    suggestionsGenerated: number;
    objectionHandled: number;
    discountGuardrailHit: number;
    avgResponseMs: number;
  }>;
  periodDays?: number;
}): SupervisorInsight[] {
  return useMemo(() => {
    const byVendedor = new Map<string, typeof sessions>();
    for (const s of sessions) {
      const list = byVendedor.get(s.vendedorId) ?? [];
      list.push(s);
      byVendedor.set(s.vendedorId, list);
    }
    return Array.from(byVendedor.entries()).map(([vendedorId, rows]) => ({
      vendedorId,
      adoptionRate:
        rows.reduce((a, r) => a + r.suggestionsUsed, 0) /
        Math.max(1, rows.reduce((a, r) => a + r.suggestionsGenerated, 0)),
      avgResponseTime:
        rows.reduce((a, r) => a + r.avgResponseMs, 0) / rows.length,
      objectionHandledCount: rows.reduce((a, r) => a + r.objectionHandled, 0),
      discountGuardrailTriggered: rows.reduce((a, r) => a + r.discountGuardrailHit, 0),
      periodDays: 30,
    }));
  }, [sessions]);
}
