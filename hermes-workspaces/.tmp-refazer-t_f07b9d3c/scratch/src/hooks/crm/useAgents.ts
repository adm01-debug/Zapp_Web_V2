import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { useAgentPresenceMap } from './useAgentPresence';

export interface AgentProfile {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  role: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  is_active: boolean | null;
  max_chats: number | null;
  created_at: string;
  updated_at: string;
}

export interface AgentWithStats extends AgentProfile {
  activeChats: number;
  status: 'online' | 'away' | 'offline';
  queues: Array<{ id: string; name: string; color: string }>;
}

// Simulated presence status - in a real app, this would come from Supabase Presence
const getAgentStatus = (lastActivity?: string): 'online' | 'away' | 'offline' => {
  if (!lastActivity) return 'offline';
  const now = new Date();
  const lastActive = new Date(lastActivity);
  const diffMinutes = (now.getTime() - lastActive.getTime()) / (1000 * 60);
  
  if (diffMinutes < 5) return 'online';
  if (diffMinutes < 30) return 'away';
  return 'offline';
};

export function useAgents() {
  const presence = useAgentPresenceMap();
  // Fetch profiles
  const { data: profiles, isLoading: loadingProfiles, error: profilesError, refetch: refetchProfiles } = useQuery({
    queryKey: ['agents-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as AgentProfile[];
    },
  });

  // Fetch queues and memberships
  const { data: queuesData, isLoading: loadingQueues } = useQuery({
    queryKey: ['agents-queues'],
    queryFn: async () => {
      const [queuesResult, membersResult] = await Promise.all([
        supabase.from('queues').select('id, name, color').eq('is_active', true),
        supabase.from('queue_members').select('queue_id, profile_id').eq('is_active', true),
      ]);

      if (queuesResult.error) throw queuesResult.error;
      if (membersResult.error) throw membersResult.error;

      return {
        queues: queuesResult.data,
        members: membersResult.data,
      };
    },
  });

  // Fetch active chats count per agent
  //
  // R2-AUTH-020: "chat ativo" é o episódio de atendimento ABERTO
  // (`conversation_status = 'open'`, contato não excluído). Contato com `assigned_to`
  // preenchido é CADASTRO — resolvido, arquivado ou aguardando não está em curso — e não
  // pode ocupar a capacidade do atendente (mesma régua do War Room, R2-MOD-030, e do
  // `inProgress` da fila). A leitura é paginada: um `select` sem `range` devolve só a
  // primeira página e a capacidade vira subtotal silencioso.
  const { data: activeChatsData } = useQuery({
    queryKey: ['agents-active-chats'],
    queryFn: async () => {
      const { rows, incomplete, error } = await fetchAllRows<{ assigned_to: string | null }>(
        (from, to) => supabase
          .from('contacts')
          .select('assigned_to')
          .not('assigned_to', 'is', null)
          .eq('conversation_status', 'open')
          .is('deleted_at', null)
          .order('id')
          .range(from, to),
      );

      // Capacidade lida pela metade é pior que capacidade indisponível: falha alto em vez
      // de exibir um número menor que o real.
      if (incomplete) {
        throw new Error(error?.message ?? 'Leitura de contatos em atendimento excedeu o limite de segurança');
      }

      // Count open conversations per agent
      const chatCounts: Record<string, number> = {};
      rows.forEach((contact) => {
        if (contact.assigned_to) {
          chatCounts[contact.assigned_to] = (chatCounts[contact.assigned_to] || 0) + 1;
        }
      });

      return chatCounts;
    },
  });

  // Combine data into AgentWithStats
  const agents: AgentWithStats[] = useMemo(() => {
    if (!profiles) return [];

    return profiles.map((profile) => {
      // Get queues for this agent
      const agentQueues = queuesData?.members
        ?.filter((m) => m.profile_id === profile.id)
        .map((m) => {
          const queue = queuesData.queues?.find((q) => q.id === m.queue_id);
          return queue ? { id: queue.id, name: queue.name, color: queue.color } : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string; color: string }> || [];

      // Get active chats count
      const activeChats = activeChatsData?.[profile.id] || 0;

      // Presença real quando o agente está conectado; senão, estimativa por updated_at
      const status = presence[profile.user_id] ?? getAgentStatus(profile.updated_at);

      return {
        ...profile,
        activeChats,
        status,
        queues: agentQueues,
      };
    });
  }, [profiles, queuesData, activeChatsData, presence]);

  const isLoading = loadingProfiles || loadingQueues;

  // Stats calculations
  const stats = useMemo(() => {
    const onlineCount = agents.filter((a) => a.status === 'online').length;
    const awayCount = agents.filter((a) => a.status === 'away').length;
    const offlineCount = agents.filter((a) => a.status === 'offline').length;
    const totalActiveChats = agents.reduce((sum, a) => sum + a.activeChats, 0);

    return {
      onlineCount,
      awayCount,
      offlineCount,
      totalActiveChats,
      totalAgents: agents.length,
    };
  }, [agents]);

  return {
    agents,
    stats,
    isLoading,
    error: profilesError,
    refetch: refetchProfiles,
  };
}
