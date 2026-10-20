/**
 * useAgentReassignment
 * 
 * Exposes RPCs for reassigning absent and overloaded agents.
 */
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useAgentReassignment() {
  const reassignAbsent = useMutation({
    mutationFn: async (inactiveMinutes: number = 30) => {
      const { data, error } = await supabase.rpc('reassign_absent_agents', {
        inactive_minutes: inactiveMinutes,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      if (count > 0) {
        toast.success(`${count} conversa(s) reatribuída(s) de agentes ausentes`);
      } else {
        toast.info('Nenhum agente ausente com conversas para reatribuir');
      }
    },
    onError: () => toast.error('Erro ao reatribuir conversas de agentes ausentes'),
  });

  const reassignOverloaded = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reassign_overloaded_agents');
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      if (count > 0) {
        toast.success(`${count} conversa(s) reatribuída(s) de agentes sobrecarregados`);
      } else {
        toast.info('Nenhum agente sobrecarregado no momento');
      }
    },
    onError: () => toast.error('Erro ao reatribuir conversas de agentes sobrecarregados'),
  });

  return {
    reassignAbsent,
    reassignOverloaded,
    isLoading: reassignAbsent.isPending || reassignOverloaded.isPending,
  };
}
