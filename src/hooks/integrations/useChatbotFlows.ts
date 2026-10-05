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

/**
 * R2-MOD-068 (item 104, P1): `nodes`, `edges` e `variables` de `chatbot_flows`
 * são colunas JSONB. Gravadas com `JSON.stringify`, o PostgREST persistia uma
 * STRING dentro do jsonb e o roundtrip reabria o grafo vazio (`Array.isArray`
 * era false). Aqui o valor cru é normalizado: se vier string (linhas legadas
 * gravadas pelo defeito) é desserializado; se já vier array/objeto (gravado
 * corretamente) é usado como está.
 */
function normalizeJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return (parsed === null || parsed === undefined ? fallback : parsed) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function normalizeFlow(row: Record<string, unknown>): ChatbotFlow {
  return {
    ...(row as unknown as ChatbotFlow),
    nodes: normalizeJsonField<ChatbotNode[]>(row.nodes, []),
    edges: normalizeJsonField<ChatbotEdge[]>(row.edges, []),
    variables: normalizeJsonField<Record<string, unknown>>(row.variables, {}),
  };
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
      return (data || []).map(row => normalizeFlow(row as Record<string, unknown>));
    },
  });

  const createFlow = useMutation({
    mutationFn: async (flow: Partial<ChatbotFlow>) => {
      // JSONB: envia o array/objeto cru — `JSON.stringify` gravava uma string
      // dentro do jsonb e fazia o grafo reabrir vazio (R2-MOD-068).
      const insertData = {
          ...flow,
          nodes: flow.nodes ?? [
            { id: 'start-1', type: 'start', data: { label: 'Início' }, position: { x: 250, y: 50 } },
          ],
          edges: flow.edges ?? [],
          variables: flow.variables ?? {},
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
      // JSONB: array/objeto cru (ver createFlow) — sem stringify.
      const payload: Record<string, unknown> = { ...updates };

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
