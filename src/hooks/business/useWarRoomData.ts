import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

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
  avgWaitTime: number;
  slaBreaches: number;
  slaWarnings: number;
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

export function useWarRoomData() {
  const { data: agents = [] } = useQuery({
    queryKey: ['warroom-agents'],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, name, avatar_url, is_active, max_chats')
        .eq('is_active', true);
      if (error) throw error;

      const { data: stats } = await supabase
        .from('agent_stats')
        .select('profile_id, messages_sent, conversations_resolved, avg_response_time_seconds, customer_satisfaction_score');

      const { data: contacts } = await supabase
        .from('contacts')
        .select('assigned_to');

      const contactCounts = (contacts || []).reduce((acc, c) => {
        if (c.assigned_to) acc[c.assigned_to] = (acc[c.assigned_to] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const statsMap = new Map((stats || []).map(s => [s.profile_id, s]));

      return (profiles || []).map((p): WarRoomAgent => {
        const agentStats = statsMap.get(p.id);
        const activeChats = contactCounts[p.id] || 0;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar_url || undefined,
          status: activeChats >= (p.max_chats || 5) ? 'busy' : 'online',
          activeChats,
          maxChats: p.max_chats || 5,
          avgResponseTime: agentStats?.avg_response_time_seconds || 0,
          resolvedToday: agentStats?.conversations_resolved || 0,
          satisfaction: Number(agentStats?.customer_satisfaction_score) || 0,
        };
      });
    },
    refetchInterval: 30000,
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['warroom-queues'],
    queryFn: async () => {
      const { data: dbQueues, error } = await supabase
        .from('queues')
        .select('id, name, color, is_active')
        .eq('is_active', true);
      if (error) throw error;

      const { data: contacts } = await supabase
        .from('contacts')
        .select('queue_id, assigned_to');

      const { data: slaData } = await supabase
        .from('conversation_sla')
        .select('contact_id, first_response_breached');

      const breachedContacts = new Set(
        (slaData || []).filter(s => s.first_response_breached).map(s => s.contact_id)
      );

      return (dbQueues || []).map((q): WarRoomQueue => {
        const queueContacts = (contacts || []).filter(c => c.queue_id === q.id);
        const waiting = queueContacts.filter(c => !c.assigned_to).length;
        const inProgress = queueContacts.filter(c => c.assigned_to).length;
        const slaBreaches = queueContacts.filter(c => breachedContacts.has(c.queue_id)).length;

        return {
          id: q.id, name: q.name, color: q.color,
          waiting, avgWaitTime: 0, slaBreaches, slaWarnings: 0, inProgress,
        };
      });
    },
    refetchInterval: 30000,
  });

  return { agents, queues, alerts: [] as WarRoomAlert[] };
}

export function useWarRoomMetrics(agents: WarRoomAgent[], queues: WarRoomQueue[]) {
  return useMemo(() => {
    const totalWaiting = queues.reduce((acc, q) => acc + q.waiting, 0);
    const totalBreaches = queues.reduce((acc, q) => acc + q.slaBreaches, 0);
    const totalWarnings = queues.reduce((acc, q) => acc + q.slaWarnings, 0);
    const onlineAgents = agents.filter(a => a.status === 'online' || a.status === 'busy').length;
    const avgSatisfaction = agents.length > 0 ? agents.reduce((acc, a) => acc + a.satisfaction, 0) / agents.length : 0;
    const totalResolved = agents.reduce((acc, a) => acc + a.resolvedToday, 0);
    return { totalWaiting, totalBreaches, totalWarnings, onlineAgents, avgSatisfaction, totalResolved };
  }, [agents, queues]);
}
