import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import type { Queue } from '@/types';

export type { Queue };

export class QueueService {
  static async fetchQueues() {
    return supabase
      .from('queues')
      .select('*')
      .order('priority', { ascending: false });
  }

  /**
   * Contagem real de contatos aguardando atendimento por fila.
   *
   * Cada fila usa `count: 'exact'` com `head: true`: o PostgREST conta no
   * servidor, sem baixar linhas e sem o corte silencioso de 1000 registros do
   * PostgREST. A definicao de "aguardando" e a mesma do dashboard
   * (`dashboard_contact_counts`, metrica `pending`): contato sem responsavel,
   * nao soft-deletado e ainda nao encerrado (resolved/archived).
   */
  static async fetchWaitingCounts(queueIds: string[]): Promise<Map<string, number>> {
    const entries = await Promise.all(
      queueIds.map(async (queueId) => {
        const { count, error } = await supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('queue_id', queueId)
          .is('assigned_to', null)
          .is('deleted_at', null)
          .not('conversation_status', 'in', '(resolved,archived)');
        if (error) throw error;
        return [queueId, count ?? 0] as const;
      })
    );
    return new Map(entries);
  }

  /**
   * Métricas por fila para cálculo de alertas: mensagens pendentes e
   * timestamp do contato mais antigo aguardando.
   *
   * Usa as funções RPC existentes (talk_me_list_queues e talk_me_list_waiting)
   * que já computam waiting_since e pending_message_count a partir da tabela
   * messages — não é possível consultar essas colunas diretamente em
   * contacts pois são valores derivados, não colunas armazenadas.
   */
  static async fetchQueueMetrics(queueIds: string[]): Promise<Map<string, { pendingMessageCount: number; oldestWaitingAt: string | null }>> {
    const metrics = new Map<string, { pendingMessageCount: number; oldestWaitingAt: string | null }>();
    queueIds.forEach(id => metrics.set(id, { pendingMessageCount: 0, oldestWaitingAt: null }));

    // oldest_waiting_at por fila
    const { data: queuesData, error: queuesError } = await supabase
      .rpc('talk_me_list_queues');
    if (queuesError) throw queuesError;

    for (const q of (queuesData ?? [])) {
      const existing = metrics.get(q.queue_id);
      if (existing) {
        existing.oldestWaitingAt = q.oldest_waiting_at ?? null;
      }
    }

    // pending_message_count por fila — soma de pending_message_count de
    // cada contato aguardando na fila (via talk_me_list_waiting), com as
    // chamadas por fila em paralelo (Promise.all). Se uma fila falhar, o erro
    // propaga e o chamador (useQueues) isola a falha.
    // p_limit 1000: se a fila tiver mais de 1000 contatos aguardando, a soma
    // é um mínimo (subestima o total); os alertas disparam do mesmo jeito.
    const waitingResults = await Promise.all(
      queueIds.map(async (queueId) => {
        const { data, error } = await supabase
          .rpc('talk_me_list_waiting', { p_queue_id: queueId, p_limit: 1000 });
        if (error) throw error;
        return [queueId, data ?? []] as const;
      })
    );

    for (const [queueId, waitingData] of waitingResults) {
      const existing = metrics.get(queueId);
      if (!existing) continue;
      for (const contact of waitingData) {
        existing.pendingMessageCount += (contact.pending_message_count ?? 0);
      }
    }

    return metrics;
  }

  static async fetchMembers() {
    return supabase
      .from('queue_members')
      .select(`
        *,
        profile:profiles(id, name, avatar_url, is_active)
      `);
  }

  static async createQueue(payload: Database['public']['Tables']['queues']['Insert']) {
    return supabase.from('queues').insert(payload).select().single();
  }

  static async updateQueue(id: string, updates: Database['public']['Tables']['queues']['Update']) {
    return supabase.from('queues').update(updates).eq('id', id);
  }

  static async deleteQueue(id: string) {
    return supabase.from('queues').delete().eq('id', id);
  }
}
