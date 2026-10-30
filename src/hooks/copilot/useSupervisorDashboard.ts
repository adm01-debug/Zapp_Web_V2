/**
 * CV-121 — Dashboard de supervisão de copilot.
 *
 * Agrega métricas das sessões de copilot abertas para o supervisor acompanhar
 * em tempo real: quantas conversas ativas, score médio, alertas sem resposta
 * e número de sugestões aceitas vs rejeitadas.
 * Stub — dados reais virão do canal Realtime quando CV-011/CV-012 estiverem prontos.
 */
import { useMemo } from 'react';

export interface CopilotSessionSummary {
  conversationId: string;
  vendorName: string;
  score: number;
  /** Sugestões exibidas ao vendedor nesta sessão. */
  suggestionsShown: number;
  /** Sugestões que o vendedor aceitou ("Usar"). */
  suggestionsAccepted: number;
  /** Alertas críticos não respondidos. */
  pendingAlerts: number;
  lastActivity: Date;
}

export interface SupervisorDashboardResult {
  totalActiveSessions: number;
  averageScore: number;
  totalPendingAlerts: number;
  acceptanceRate: number;
  /** Top 3 sessões com mais alertas pendentes. */
  topAlertSessions: CopilotSessionSummary[];
}

export interface UseSupervisorDashboardOptions {
  /** Sessões abertas reportadas pelo canal Realtime. */
  sessions: CopilotSessionSummary[];
}

export function useSupervisorDashboard({
  sessions,
}: UseSupervisorDashboardOptions): SupervisorDashboardResult {
  return useMemo(() => {
    if (sessions.length === 0) {
      return {
        totalActiveSessions: 0,
        averageScore: 0,
        totalPendingAlerts: 0,
        acceptanceRate: 0,
        topAlertSessions: [],
      };
    }

    const totalActiveSessions = sessions.length;
    const averageScore =
      sessions.reduce((sum, s) => sum + s.score, 0) / totalActiveSessions;
    const totalPendingAlerts = sessions.reduce((sum, s) => sum + s.pendingAlerts, 0);
    const totalShown = sessions.reduce((sum, s) => sum + s.suggestionsShown, 0);
    const totalAccepted = sessions.reduce((sum, s) => sum + s.suggestionsAccepted, 0);
    const acceptanceRate = totalShown > 0 ? totalAccepted / totalShown : 0;

    const topAlertSessions = [...sessions]
      .sort((a, b) => b.pendingAlerts - a.pendingAlerts)
      .slice(0, 3);

    return {
      totalActiveSessions,
      averageScore,
      totalPendingAlerts,
      acceptanceRate,
      topAlertSessions,
    };
  }, [sessions]);
}
