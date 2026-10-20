import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type ChatbotFlowInsert = Database['public']['Tables']['chatbot_flows']['Insert'];
type ChatbotFlowUpdate = Database['public']['Tables']['chatbot_flows']['Update'];

export interface ChatbotNode {
  id: string;
  type: 'start' | 'message' | 'question' | 'condition' | 'action' | 'delay' | 'transfer' | 'end';
  data: {
    label: string;
    content?: string;
    options?: string[];
    condition?: { field: string; operator: string; value: string };
    action?: string;
    delaySeconds?: number;
    transferTo?: string;
  };
  position: { x: number; y: number };
}

export interface ChatbotEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface ChatbotFlow {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: 'keyword' | 'first_message' | 'menu' | 'webhook' | 'schedule';
  trigger_value: string | null;
  nodes: ChatbotNode[];
  edges: ChatbotEdge[];
  variables: Record<string, unknown>;
  whatsapp_connection_id: string | null;
  created_by: string | null;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useChatbotFlows() {
  const queryClient = useQueryClient();

  const flowsQuery = useQuery({
    queryKey: ['chatbot-flows'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chatbot_flows')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ChatbotFlow[];
    },
  });

  const createFlow = useMutation({
    mutationFn: async (flow: Partial<ChatbotFlow>) => {
      const insertData = {
          ...flow,
          nodes: JSON.stringify(flow.nodes ?? [
            { id: 'start-1', type: 'start', data: { label: 'Início' }, position: { x: 250, y: 50 } },
          ]),
          edges: JSON.stringify(flow.edges ?? []),
          variables: JSON.stringify(flow.variables ?? {}),
        };
      const { data, error } = await supabase
        .from('chatbot_flows')
        .insert(insertData as unknown as ChatbotFlowInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] });
      toast.success('Fluxo de chatbot criado!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const updateFlow = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ChatbotFlow> & { id: string }) => {
      const payload: Record<string, unknown> = { ...updates };
      if (updates.nodes) payload.nodes = JSON.stringify(updates.nodes);
      if (updates.edges) payload.edges = JSON.stringify(updates.edges);
      if (updates.variables) payload.variables = JSON.stringify(updates.variables);

      const { data, error } = await supabase
        .from('chatbot_flows')
        .update(payload as unknown as ChatbotFlowUpdate)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] });
      toast.success('Fluxo atualizado!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const deleteFlow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('chatbot_flows')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] });
      toast.success('Fluxo excluído!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  const toggleFlow = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('chatbot_flows')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { is_active }) => {
      queryClient.invalidateQueries({ queryKey: ['chatbot-flows'] });
      toast.success(is_active ? 'Fluxo ativado!' : 'Fluxo desativado!');
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });

  return {
    flows: flowsQuery.data ?? [],
    isLoading: flowsQuery.isLoading,
    createFlow,
    updateFlow,
    deleteFlow,
    toggleFlow,
    refetch: flowsQuery.refetch,
  };
}
