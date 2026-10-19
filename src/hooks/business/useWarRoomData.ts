import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useAgentPresenceMap } from '@/hooks/crm/useAgentPresence';

export interface WarRoomAgent {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'busy' | 'away' | 'offline';
  activeChats: number;
  maxChats: number;
  /** `null` = não houve 1ª resposta medida hoje (não é "0s medido"). */
  avgResponseTime: number | null;
  resolvedToday: number;
  /** `null` = nenhuma avaliação no dia (não é "0 de satisfação"). */
  satisfaction: number | null;
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

/** Opções do hook: o intervalo de atualização automática é do chamador. */
export interface WarRoomDataOptions {
  /** Milissegundos entre atualizações automáticas; `false` desliga o polling. */
  refetchInterval?: number | false;
}

/** Linha do RPC `warroom_agent_today` (números agregados no banco, não no cliente). */
interface WarRoomAgentRpcRow {
  id: string;
  name: string;
  avatar: string | null;
  maxChats: number;
  activeChats: number;
  resolvedToday: number;
  avgResponseTime: number | null;
  satisfaction: number | null;
}

/** Linha do RPC `warroom_queue_stats`. */
interface WarRoomQueueRpcRow {
  id: string;
  name: string;
  color: string | null;
  waiting: number;
  inProgress: number;
  slaBreaches: number;
  slaWarnings: number | null;
  avgWaitTime: number | null;
}

/** Linha de agente antes do status de presença (presença é do store, não do banco de métricas). */
interface WarRoomAgentBase extends Omit<WarRoomAgent, 'status'> {
  user_id: string | null;
}

/**
 * Teto de linhas que os RPCs `warroom_agent_today` e `warroom_queue_stats` podem devolver.
 * Acima disso o dado é parcial (a PostgREST corta silenciosamente) — o hook lança erro para
 * que a central de supervisão mostre falha em vez de total cortado.
 */
export const WARROOM_MAX_ROWS = 200;

/**
 * War Room.
 *
 * R2-MOD-030: cadastro habilitado (`profiles.is_active`) **não** é presença; contato atribuído
 * **não** é atendimento em curso. O online/busy vem de `agent_presence` (mesma fonte do Dashboard
 * — `useAgentPresenceMap`); o resto dos números vem dos RPCs `warroom_agent_today` e
 * `warroom_queue_stats`, que agregam no banco (a leitura direta pela PostgREST corta em 1000 linhas
 * de `contacts` e transforma o total em subtotal silencioso). Amostra ausente sai como `null` em vez
 * de zero, para a supervisão não ler cadastro como disponibilidade nem ausência de medição como
 * "risco zero" ou "0s de resposta" — a tela mostra '—'.
 *
 * O RPC não devolve o `user_id`; a presença precisa dele, então mantemos uma leitura mínima de
 * `profiles` (id → user_id), sem nenhuma varredura de `contacts`/`conversation_sla` no cliente.
 */
export function useWarRoomData({ refetchInterval = 30000 }: WarRoomDataOptions = {}) {
  const presence = useAgentPresenceMap();

  const agentsQuery = useQuery({
    queryKey: ['warroom-agents'],
    queryFn: async (): Promise<WarRoomAgentBase[]> => {
      const [today, activeProfiles] = await Promise.all([
        supabase.rpc('warroom_agent_today'),
        supabase.from('profiles').select('id, user_id').eq('is_active', true),
      ]);
      if (today.error) throw today.error;
      if (activeProfiles.error) throw activeProfiles.error;

      const rows = (today.data ?? []) as unknown as WarRoomAgentRpcRow[];
      if (rows.length > WARROOM_MAX_ROWS) {
        throw new Error(`warroom_agent_today devolveu ${rows.length} linhas — dado parcial, recuse o subtotal`);
      }
      const userIdByProfile = new Map(
        (activeProfiles.data ?? []).map(p => [p.id, p.user_id ?? null] as const),
      );

      return rows.map((r): WarRoomAgentBase => ({
        id: r.id,
        user_id: userIdByProfile.get(r.id) ?? null,
        name: r.name,
        avatar: r.avatar || undefined,
        activeChats: r.activeChats,
        maxChats: r.maxChats,
        // null do RPC continua null: não medido ≠ zero medido.
        avgResponseTime: r.avgResponseTime ?? null,
        resolvedToday: r.resolvedToday,
        satisfaction: r.satisfaction ?? null,
      }));
    },
    refetchInterval,
  });

  // Status derivado da presença em tempo real (não do cadastro) — atualiza sem refetch.
  const agents = useMemo<WarRoomAgent[]>(() => (agentsQuery.data ?? []).map((a) => {
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
  }), [agentsQuery.data, presence]);

  const queuesQuery = useQuery({
    queryKey: ['warroom-queues'],
    queryFn: async (): Promise<WarRoomQueue[]> => {
      const { data, error } = await supabase.rpc('warroom_queue_stats');
      if (error) throw error;

      const rows = (data ?? []) as unknown as WarRoomQueueRpcRow[];
      if (rows.length > WARROOM_MAX_ROWS) {
        throw new Error(`warroom_queue_stats devolveu ${rows.length} linhas — dado parcial, recuse o subtotal`);
      }
      return rows.map((q): WarRoomQueue => ({
        id: q.id,
        name: q.name,
        color: q.color ?? '',
        waiting: q.waiting,
        inProgress: q.inProgress,
        slaBreaches: q.slaBreaches,
        // null do RPC continua null (a tela mostra '—', não "risco zero").
        slaWarnings: q.slaWarnings ?? null,
        avgWaitTime: q.avgWaitTime ?? null,
      }));
    },
    refetchInterval,
  });

  const queues = queuesQuery.data ?? [];

  const refetch = async () => {
    await Promise.all([agentsQuery.refetch(), queuesQuery.refetch()]);
  };

  return {
    agents,
    queues,
    alerts: [] as WarRoomAlert[],
    isLoading: agentsQuery.isLoading || queuesQuery.isLoading,
    isError: agentsQuery.isError || queuesQuery.isError,
    error: agentsQuery.error ?? queuesQuery.error ?? null,
    dataUpdatedAt: Math.max(agentsQuery.dataUpdatedAt, queuesQuery.dataUpdatedAt),
    refetch,
  };
}

export interface WarRoomMetrics {
  totalWaiting: number;
  totalBreaches: number;
  /** `null` quando nenhuma fila tem risco calculado. */
  totalWarnings: number | null;
  onlineAgents: number;
  /** Média só sobre agentes com amostra; `0` quando nenhum agente tem avaliação no dia. */
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
    // Média só sobre quem tem amostra: agente sem avaliação não puxa a média para baixo como zero.
    // Se ninguém tem amostra, fica 0 (a tela mostra '—' por `agents[].satisfaction === null`, no card da tela).
    const avaliados = agents.filter((a): a is WarRoomAgent & { satisfaction: number } => a.satisfaction !== null);
    const avgSatisfaction = avaliados.length > 0
      ? avaliados.reduce((acc, a) => acc + a.satisfaction, 0) / avaliados.length
      : 0;
    const totalResolved = agents.reduce((acc, a) => acc + a.resolvedToday, 0);
    return { totalWaiting, totalBreaches, totalWarnings, onlineAgents, avgSatisfaction, totalResolved };
  }, [agents, queues]);
}
