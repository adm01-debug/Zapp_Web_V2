import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';

export interface AutoCloseConfig {
  id: string;
  inactivity_hours: number;
  is_enabled: boolean;
  close_message: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useAutoCloseConversations() {
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['auto-close-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auto_close_config')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;
      return data as AutoCloseConfig;
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (updates: Partial<Pick<AutoCloseConfig, 'inactivity_hours' | 'is_enabled' | 'close_message'>>) => {
      const config = configQuery.data;
      if (!config) throw new Error('Config not found');

      const { error } = await supabase
        .from('auto_close_config')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', config.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-close-config'] });
      toast({ title: 'Configuração salva', description: 'Auto-fechamento atualizado com sucesso.' });
    },
    onError: () => {
      toast({ title: 'Erro ao salvar', variant: 'destructive' });
    },
  });

  return {
    config: configQuery.data,
    isLoading: configQuery.isLoading,
    updateConfig,
  };
}
