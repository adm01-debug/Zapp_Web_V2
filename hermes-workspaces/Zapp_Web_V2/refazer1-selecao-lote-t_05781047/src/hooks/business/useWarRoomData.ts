import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAgentPresenceMap } from '@/hooks/crm/useAgentPresence';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface WarRoomAgent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  activeChats: number;
  maxChats: number;
  avgResponseTime: number;
  resolvedToday: number;
  satisfaction: number;
}

export interface WarRoomQueue {
  id: string;
  name: string;
  color: string;
  waiting: number;
  /** `null` = não calculado (não é "zero minutos" medido). */
  avgWaitTime: number | null;
  slaBreaches: number;
  /** `null` = não calculado (não é "zero risco" medido). */
  slaWarnings: number | null;
  inProgress: number;
}

export interface WarRoomAlert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  isNew?: boolean;
}

/** Linha de agente como sai da consulta, antes do status de presença. */
interface WarRoomAgentBase {
  id: string;
  user_id: string | null;
  name: string;
  avatar?: string;
  activeChats: number;
  maxChats: number;
  avgResponseTime: number;
  resolvedToday: number;
  satisfaction: number;
}

/**
 * War Room.
 *
 * R2-MOD-030: cadastro habilitado (`profiles.is_active`) **não** é presença; contato atribuído
 * **não** é atendimento em curso. Aqui o online/busy vem de `agent_presence` (mesma fonte do
 * Dashboard — `useAgentPresenceMap`), a ocupação conta só o episódio **aberto**
 * (`contacts.conversation_status = 'open'`) e espera/risco que não são medidos saem como `null`
 * em vez de zero, para a supervisão não ler cadastro como disponibilidade nem ausência de medição
 * como "risco zero".
 *
 * As leituras de `contacts` são paginadas (`fetchAllRows`): sem `range` o PostgREST devolve só a
 * primeira página e as contagens viram subtotais silenciosos.
 */
export function useWarRoomData() {
  const presence = useAgentPresenceMap();

  const { data: agentsBase = [] } = useQuery({
    queryKey: ['warroom-agents'],
    queryFn: async (): Promise<WarRoomAgentBase[]> => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar_url, is_active, max_chats')
        .eq('is_active', true);
      if (error) throw error;

      const { data: stats } = await supabase
        .from('agent_stats')
        .select('profile_id, messages_sent, conversations_resolved, avg_response_time_seconds, customer_satisfaction_score');

      // Só o episódio aberto ocupa capacidade: conversa resolvida/arquivada continua com
      // `assigned_to` preenchido no cadastro e não pode contar como atendimento ativo.
      const { rows: openContacts } = await fetchAllRows<{ assigned_to: string | null; conversation_status: string }>(
        (from, to) => supabase
          .from('contacts')
          .select('assigned_to, conversation_status')
          .eq('conversation_status', 'open')
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
      );

      const activeChatsByAgent = new Map<string, number>();
      for (const c of openContacts) {
        if (!c.assigned_to) continue;
        activeChatsByAgent.set(c.assigned_to, (activeChatsByAgent.get(c.assigned_to) ?? 0) + 1);
      }

      const statsMap = new Map((stats || []).map(s => [s.profile_id, s]));

      return (profiles || []).map((p): WarRoomAgentBase => {
        const agentStats = statsMap.get(p.id);
        return {
          id: p.id,
          user_id: p.user_id ?? null,
          name: p.name,
          avatar: p.avatar_url || undefined,
          activeChats: activeChatsByAgent.get(p.id) ?? 0,
          maxChats: p.max_chats || 5,
          avgResponseTime: agentStats?.avg_response_time_seconds || 0,
          resolvedToday: agentStats?.conversations_resolved || 0,
          satisfaction: Number(agentStats?.customer_satisfaction_score) || 0,
        };
      });
    },
    refetchInterval: 30000,
  });

  // Status derivado da presença em tempo real (não do cadastro) — atualiza sem refetch.
  const agents = useMemo<WarRoomAgent[]>(() => agentsBase.map((a) => {
    const status = a.user_id ? presence[a.user_id] : undefined;
    return {
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      status: status === 'online' ? (a.activeChats >= a.maxChats ? 'busy' : 'online') : status === 'away' ? 'away' : 'offline',
      activeChats: a.activeChats,
      maxChats: a.maxChats,
      avgResponseTime: a.avgResponseTime,
      resolvedToday: a.resolvedToday,
      satisfaction: a.satisfaction,
    };
  }), [agentsBase, presence]);

  const { data: queues = [] } = useQuery({
    queryKey: ['warroom-queues'],
    queryFn: async (): Promise<WarRoomQueue[]> => {
      const { data: dbQueues, error } = await supabase
        .from('queues')
        .select('id, name, color, is_active')
        .eq('is_active', true);
      if (error) throw error;

      // Fila é episódio em andamento: resolvida/arquivada não é espera nem atendimento.
      const { rows: queueContacts } = await fetchAllRows<{
        id: string;
        queue_id: string | null;
        assigned_to: string | null;
        conversation_status: string;
      }>(
        (from, to) => supabase
          .from('contacts')
          .select('id, queue_id, assigned_to, conversation_status')
          .not('conversation_status', 'in', '(resolved,archived)')
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
      );

      const { data: slaData } = await supabase
        .from('conversation_sla')
        .select('contact_id, first_response_breached');

      const breachedContacts = new Set(
        (slaData || []).filter(s => s.first_response_breached).map(s => s.contact_id)
      );

      return (dbQueues || []).map((q): WarRoomQueue => {
        const contactsDaFila = queueContacts.filter(c => c.queue_id === q.id);
        const waiting = contactsDaFila.filter(c => !c.assigned_to).length;
        const inProgress = contactsDaFila.filter(c => c.assigned_to && c.conversation_status === 'open').length;
        const slaBreaches = contactsDaFila.filter(c => breachedContacts.has(c.id)).length;

        return {
          id: q.id, name: q.name, color: q.color,
          // Espera média e risco não são medidos hoje (sem fonte de tempo de espera nem de
          // proximidade do prazo): `null` mantém "não calculado" distinto de "zero medido".
          waiting, avgWaitTime: null, slaBreaches, slaWarnings: null, inProgress,
        };
      });
    },
    refetchInterval: 30000,
  });

  return { agents, queues, alerts: [] as WarRoomAlert[] };
}

export interface WarRoomMetrics {
  totalWaiting: number;
  totalBreaches: number;
  /** `null` quando nenhuma fila tem risco calculado. */
  totalWarnings: number | null;
  onlineAgents: number;
  avgSatisfaction: number;
  totalResolved: number;
}

export function useWarRoomMetrics(agents: WarRoomAgent[], queues: WarRoomQueue[]): WarRoomMetrics {
  return useMemo(() => {
    const totalWaiting = queues.reduce((acc, q) => acc + q.waiting, 0);
    const totalBreaches = queues.reduce((acc, q) => acc + q.slaBreaches, 0);
    const filasComRisco = queues.filter(q => q.slaWarnings !== null);
    const totalWarnings = filasComRisco.length
      ? filasComRisco.reduce((acc, q) => acc + (q.slaWarnings ?? 0), 0)
      : null;
    const onlineAgents = agents.filter(a => a.status === 'online' || a.status === 'busy').length;
    const avgSatisfaction = agents.length > 0 ? agents.reduce((acc, a) => acc + a.satisfaction, 0) / agents.length : 0;
    const totalResolved = agents.reduce((acc, a) => acc + a.resolvedToday, 0);
    return { totalWaiting, totalBreaches, totalWarnings, onlineAgents, avgSatisfaction, totalResolved };
  }, [agents, queues]);
}
