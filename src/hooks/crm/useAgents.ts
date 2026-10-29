import { useMemo } from 'react';
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
  /**
   * Conversas em atendimento do atendente. `null` = leitura indisponível (a tela
   * mostra '—'); nunca `0`, que afirmaria "sem conversa" sem ter lido nada.
   */
  activeChats: number | null;
  /**
   * Estado publicado pelo agente conectado (useAgentPresenceMap). Sem presença
   * publicada é `offline`: `updated_at` é edição de cadastro, não presença.
   */
  status: 'online' | 'away' | 'offline';
  queues: Array<{ id: string; name: string; color: string }>;
}

/** Erro de cada consulta da lista (null = leitura boa). */
export interface AgentsReadErrors {
  profiles: Error | null;
  queues: Error | null;
  members: Error | null;
  activeChats: Error | null;
}

export function useAgents() {
  const presence = useAgentPresenceMap();
  // Fetch profiles
  const { data: profiles, isLoading: loadingProfiles, error: profilesError, refetch: refetchProfiles } = useQuery({
    queryKey: ['agents-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        // Conta desativada sai da lista: ela não atende, então não entra em Offline
        // nem no total de atendentes. `is not false` mantém quem nunca teve o campo
        // preenchido (null) na lista.
        .not('is_active', 'is', false)
        .order('name');

      if (error) throw error;
      return data as AgentProfile[];
    },
  });

  // Filas ativas e vínculos (membros) em consultas separadas: assim o erro de cada
  // uma chega à tela em vez de virar "sem filas atribuídas".
  const { data: queues, isLoading: loadingQueues, error: queuesError } = useQuery({
    queryKey: ['agents-queues'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queues')
        .select('id, name, color')
        .eq('is_active', true);

      if (error) throw error;
      return data as Array<{ id: string; name: string; color: string }>;
    },
  });

  const { data: members, isLoading: loadingMembers, error: membersError } = useQuery({
    queryKey: ['agents-queue-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('queue_members')
        .select('queue_id, profile_id')
        .eq('is_active', true);

      if (error) throw error;
      return data as Array<{ queue_id: string; profile_id: string }>;
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
  const { data: activeChatsData, error: activeChatsError } = useQuery({
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
      // de exibir um número menor que o real (a tela mostra '—').
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
      const agentQueues = members && queues
        ? members
          .filter((m) => m.profile_id === profile.id)
          .map((m) => {
            const queue = queues.find((q) => q.id === m.queue_id);
            return queue ? { id: queue.id, name: queue.name, color: queue.color } : null;
          })
          .filter(Boolean) as Array<{ id: string; name: string; color: string }>
        : [];

      // Get active chats count — erro de leitura vira `null` (indisponível), não 0.
      const activeChats = activeChatsError ? null : (activeChatsData?.[profile.id] ?? 0);

      // Só presença publicada conta; sem ela, o atendente está offline.
      const status = presence[profile.user_id] ?? 'offline';

      return {
        ...profile,
        activeChats,
        status,
        queues: agentQueues,
      };
    });
  }, [profiles, queues, members, activeChatsData, activeChatsError, presence]);

  const isLoading = loadingProfiles || loadingQueues || loadingMembers;

  // Stats calculations
  const stats = useMemo(() => {
    const onlineCount = agents.filter((a) => a.status === 'online').length;
    const awayCount = agents.filter((a) => a.status === 'away').length;
    const offlineCount = agents.filter((a) => a.status === 'offline').length;
    // Capacidade desconhecida de qualquer atendente torna o total desconhecido: somar só
    // o que foi lido apresentaria um subtotal como se fosse o total.
    const totalActiveChats = agents.some((a) => a.activeChats === null)
      ? null
      : agents.reduce((sum, a) => sum + (a.activeChats ?? 0), 0);

    return {
      onlineCount,
      awayCount,
      offlineCount,
      totalActiveChats,
      totalAgents: agents.length,
    };
  }, [agents]);

  const errors: AgentsReadErrors = {
    profiles: profilesError ?? null,
    queues: queuesError ?? null,
    members: membersError ?? null,
    activeChats: activeChatsError ?? null,
  };

  return {
    agents,
    stats,
    isLoading,
    error: errors.profiles ?? errors.queues ?? errors.members ?? errors.activeChats,
    errors,
    refetch: refetchProfiles,
  };
}
