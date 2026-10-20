import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Triggers skill_based_assign RPC to find the best agent for a queue.
 * Considers agent skills + current workload.
 */
export function useSkillBasedAssign() {
  return useMutation({
    mutationFn: async (queueId: string) => {
      const { data, error } = await supabase.rpc('skill_based_assign', {
        p_queue_id: queueId,
      });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (agentId) => {
      if (agentId) {
        toast.success('Agente atribuído por habilidade');
      } else {
        toast.warning('Nenhum agente qualificado disponível');
      }
    },
    onError: (err) => {
      toast.error(`Erro na atribuição: ${err.message}`);
    },
  });
}
