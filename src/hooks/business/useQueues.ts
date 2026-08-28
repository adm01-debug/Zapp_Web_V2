 import { useState, useEffect, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
  import { QueueService } from '@/services/queue.service';
 import { useSupabaseRealtime } from '@/hooks/realtime/useSupabaseRealtime';
 import { useToast } from '@/hooks/ui/use-toast';
 import { log } from '@/lib/logger';
 
  import type { Queue } from '@/services/queue.service';
  export type { Queue };

export interface QueueMember {
  id: string;
  queue_id: string;
  profile_id: string;
  is_active: boolean;
  created_at: string;
  profile?: {
    id: string;
    name: string;
    avatar_url: string | null;
    is_active: boolean;
  };
}

export interface QueueWithMembers extends Queue {
  members: QueueMember[];
  waiting_count: number;
}

export function useQueues() {
  const [queues, setQueues] = useState<QueueWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

   const fetchQueues = useCallback(async () => {
     try {
       setLoading(true);
       const [{ data: queuesData, error: queuesError }, { data: membersData, error: membersError }] = await Promise.all([
         QueueService.fetchQueues(),
         QueueService.fetchMembers()
       ]);
 
       if (queuesError) throw queuesError;
       if (membersError) throw membersError;
 
       const queuesWithMembers: QueueWithMembers[] = (queuesData || []).map(queue => ({
         ...queue,
         members: (membersData || []).filter(m => m.queue_id === queue.id) as QueueMember[],
         waiting_count: 0 // Waiting counts logic could be moved to service if needed
       }));
 
       setQueues(queuesWithMembers);
       setError(null);
     } catch (err) {
       log.error('Error fetching queues:', err);
       setError(err as Error);
     } finally {
       setLoading(false);
     }
   }, []);

   const createQueue = async (queue: Partial<Queue>) => {
     try {
       const { data, error } = await QueueService.createQueue({
         name: queue.name!,
         description: queue.description,
         color: queue.color || '#3B82F6',
         max_wait_time_minutes: queue.max_wait_time_minutes || 30,
         priority: queue.priority || 0
       });
       if (error) throw error;

      toast({
        title: 'Fila criada',
        description: `A fila "${queue.name}" foi criada com sucesso.`
      });

      await fetchQueues();
      return data;
    } catch (err) {
      log.error('Error creating queue:', err);
      toast({
        title: 'Erro ao criar fila',
        description: 'Não foi possível criar a fila.',
        variant: 'destructive'
      });
      throw err;
    }
  };

   const updateQueue = async (id: string, updates: Partial<Queue>) => {
     try {
       const { error } = await QueueService.updateQueue(id, updates);
       if (error) throw error;

      toast({
        title: 'Fila atualizada',
        description: 'A fila foi atualizada com sucesso.'
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error updating queue:', err);
      toast({
        title: 'Erro ao atualizar fila',
        description: 'Não foi possível atualizar a fila.',
        variant: 'destructive'
      });
      throw err;
    }
  };

   const deleteQueue = async (id: string) => {
     try {
       const { error } = await QueueService.deleteQueue(id);
       if (error) throw error;

      toast({
        title: 'Fila excluída',
        description: 'A fila foi excluída com sucesso.'
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error deleting queue:', err);
      toast({
        title: 'Erro ao excluir fila',
        description: 'Não foi possível excluir a fila.',
        variant: 'destructive'
      });
      throw err;
    }
  };

  const addMember = async (queueId: string, profileId: string) => {
    try {
      const { error } = await supabase
        .from('queue_members')
        .insert({
          queue_id: queueId,
          profile_id: profileId
        });

      if (error) throw error;

      toast({
        title: 'Membro adicionado',
        description: 'O atendente foi adicionado à fila.'
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error adding member:', err);
      toast({
        title: 'Erro ao adicionar membro',
        description: 'Não foi possível adicionar o atendente.',
        variant: 'destructive'
      });
      throw err;
    }
  };

   const removeMember = async (queueId: string, profileId: string) => {
     try {
       const { error } = await supabase
         .from('queue_members')
         .delete()
         .match({ queue_id: queueId, profile_id: profileId });

      if (error) throw error;

      toast({
        title: 'Membro removido',
        description: 'O atendente foi removido da fila.'
      });

      await fetchQueues();
    } catch (err) {
      log.error('Error removing member:', err);
      toast({
        title: 'Erro ao remover membro',
        description: 'Não foi possível remover o atendente.',
        variant: 'destructive'
      });
      throw err;
    }
  };

   const assignContactToQueue = async (contactId: string, queueId: string | null) => {
     try {
       const { error } = await supabase
         .from('contacts')
         .update({ queue_id: queueId, assigned_to: null })
         .match({ id: contactId });

      if (error) throw error;

      toast({
        title: queueId ? 'Contato atribuído' : 'Contato removido da fila',
        description: queueId 
          ? 'O contato foi atribuído à fila e será distribuído automaticamente.'
          : 'O contato foi removido da fila.'
      });
    } catch (err) {
      log.error('Error assigning contact:', err);
      toast({
        title: 'Erro ao atribuir contato',
        description: 'Não foi possível atribuir o contato à fila.',
        variant: 'destructive'
      });
      throw err;
    }
  };

   useEffect(() => {
     fetchQueues();
   }, [fetchQueues]);
 
   useSupabaseRealtime({
     channelName: 'queues-changes',
     table: 'queues',
     onAll: fetchQueues,
   });
 
   useSupabaseRealtime({
     channelName: 'queue-members-changes',
     table: 'queue_members',
     onAll: fetchQueues,
   });

  return {
    queues,
    loading,
    error,
    createQueue,
    updateQueue,
    deleteQueue,
    addMember,
    removeMember,
    assignContactToQueue,
    refetch: fetchQueues
  };
}
