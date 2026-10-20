import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  trigger_config: Json;
  actions: Json[];
  created_by: string | null;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export function useAutomations() {
  const queryClient = useQueryClient();

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AutomationRow[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (automation: Partial<AutomationRow>) => {
      const { data, error } = await supabase
        .from('automations')
        .insert({
          name: automation.name || 'Nova Automação',
          description: automation.description || '',
          trigger_type: automation.trigger_type || 'new_message',
          trigger_config: automation.trigger_config || {},
          actions: automation.actions || [],
          is_active: automation.is_active ?? true,
          created_by: automation.created_by,
        } as unknown as Database['public']['Tables']['automations']['Insert'])
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['automations'] }); toast.success('Automação criada!'); },
    onError: () => toast.error('Erro ao criar automação'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AutomationRow> & { id: string }) => {
      const { error } = await supabase
        .from('automations')
        .update(updates as unknown as Database['public']['Tables']['automations']['Update'])
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['automations'] }); toast.success('Automação atualizada!'); },
    onError: () => toast.error('Erro ao atualizar automação'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('automations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['automations'] }); toast.success('Automação removida!'); },
    onError: () => toast.error('Erro ao remover automação'),
  });

  return { automations, isLoading, createMutation, updateMutation, deleteMutation };
}
