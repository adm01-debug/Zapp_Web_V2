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
