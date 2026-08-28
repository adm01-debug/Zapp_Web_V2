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
