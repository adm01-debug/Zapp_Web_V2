import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';

export interface UnconfirmedMessage {
  id: string;
  content: string | null;
  created_at: string;
  delivery_post_started_at: string;
  status: string;
  contact_id: string | null;
  agent_id: string | null;
}

// Janela mínima antes de exibir como "ambígua": 2 minutos após o POST ter sido iniciado.
// Abaixo desse limiar o job de reconciliação ainda pode fechar sozinho.
const AMBIGUOUS_THRESHOLD_MS = 2 * 60 * 1000;

export function useUnconfirmedMessages(conversationContactId: string | null | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unconfirmed-messages', conversationContactId],
    queryFn: async () => {
      if (!conversationContactId) return [];
      const threshold = new Date(Date.now() - AMBIGUOUS_THRESHOLD_MS).toISOString();
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at, delivery_post_started_at, status, contact_id, agent_id')
        .eq('contact_id', conversationContactId)
        .eq('sender', 'agent')
        .not('delivery_post_started_at', 'is', null)
        .not('status', 'in', '("sent","delivered","read")')
        .lt('delivery_post_started_at', threshold)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UnconfirmedMessage[];
    },
    enabled: !!conversationContactId,
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ messageId, outcome }: { messageId: string; outcome: 'sent' | 'not_delivered' }) => {
      const { data, error } = await supabase.rpc('resolve_unconfirmed_message', {
        p_message_id: messageId,
        p_outcome: outcome,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['unconfirmed-messages', conversationContactId] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      const label = variables.outcome === 'sent' ? 'marcada como entregue' : 'marcada como não entregue';
      toast({ title: `Mensagem ${label}`, description: 'Status corrigido manualmente.' });
    },
    onError: (error: Error) => {
      const msg = error.message.includes('message_not_resolvable')
        ? 'Mensagem já resolvida ou não elegível.'
        : error.message.includes('admin_or_supervisor_required')
          ? 'Apenas admins e supervisores podem corrigir status.'
          : 'Erro ao corrigir status. Tente novamente.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });

  return {
    messages: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    resolve: resolveMutation.mutate,
    isResolving: resolveMutation.isPending,
    resolvingId: resolveMutation.isPending ? (resolveMutation.variables as { messageId: string } | undefined)?.messageId : null,
  };
}
