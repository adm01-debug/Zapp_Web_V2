import { useState, useEffect, useCallback } from 'react';

export interface ActiveConversation {
  conversationId: string;
  contactName: string;
  vendorId: string;
  vendorName: string;
  stage: string;
  temperature: number;
  estimatedValue: number;
  riskScore: number;
  priority: number;
  lastMessageAt: string;
}

export interface UseSupervisorControlTowerOptions {
  supervisorId: string;
  teamId?: string;
  refreshIntervalMs?: number;
  onConversationAlert?: (conv: ActiveConversation) => void;
}

export interface SupervisorControlTowerState {
  conversations: ActiveConversation[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  refresh: () => void;
  resolveAlert: (conversationId: string) => void;
}

/**
 * CV-121 — Torre de controle do supervisor (ESTENDE IA-117 + SupervisorCopilot.tsx).
 * Busca conversas ativas da equipe, ordena por risco×valor e emite alertas.
 */
export function useSupervisorControlTower({
  supervisorId,
  teamId,
  refreshIntervalMs = 30_000,
  onConversationAlert,
}: UseSupervisorControlTowerOptions): SupervisorControlTowerState {
  const [conversations, setConversations] = useState<ActiveConversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const fetchConversations = useCallback(async () => {
    if (!supervisorId) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ supervisor_id: supervisorId });
      if (teamId) params.set('team_id', teamId);
      const res = await fetch(`/api/radar-control-tower?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ActiveConversation[] = await res.json();
      const sorted = [...data].sort(
        (a, b) => b.estimatedValue * b.riskScore - a.estimatedValue * a.riskScore
      );
      sorted.forEach(c => {
        if (c.temperature < 0.3 && c.riskScore > 0.7 && !resolvedIds.has(c.conversationId)) {
          onConversationAlert?.(c);
        }
      });
      setConversations(sorted);
      setLastUpdated(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao buscar conversas');
    } finally {
      setIsLoading(false);
    }
  }, [supervisorId, teamId, onConversationAlert, resolvedIds]);

  useEffect(() => {
    fetchConversations();
    const id = setInterval(fetchConversations, refreshIntervalMs);
    return () => clearInterval(id);
  }, [fetchConversations, refreshIntervalMs]);

  const resolveAlert = useCallback((conversationId: string) => {
    setResolvedIds(prev => new Set([...prev, conversationId]));
  }, []);

  return { conversations, isLoading, error, lastUpdated, refresh: fetchConversations, resolveAlert };
}
