import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

export function useContactAssignment(contactId: string) {
  const assignAgent = useCallback(async (agentId: string | null) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ assigned_to: agentId })
        .eq('id', contactId);

      if (error) throw error;
      toast.success(agentId ? 'Atendente atribuído' : 'Atendente removido');
    } catch (err) {
      log.error('Error assigning agent:', err);
      toast.error('Erro ao atribuir atendente');
    }
  }, [contactId]);

  const assignQueue = useCallback(async (queueId: string | null) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .update({ queue_id: queueId })
        .eq('id', contactId);

      if (error) throw error;
      toast.success(queueId ? 'Fila atribuída' : 'Fila removida');
    } catch (err) {
      log.error('Error assigning queue:', err);
      toast.error('Erro ao atribuir fila');
    }
  }, [contactId]);

  return { assignAgent, assignQueue };
}
