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

/** 42703 = coluna ausente; PGRST202 = função ausente no schema cache (pré-DDL). */
export function isSchemaNotReadyError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === '42703' || code === 'PGRST202';
}

interface UnconfirmedQueryResult {
  rows: UnconfirmedMessage[];
  /** false = migration 20261111160000 ainda não aplicada. */
  schemaReady: boolean;
}

// Janela mínima antes de exibir como "ambígua": 2 minutos após o POST ter sido iniciado.
// Abaixo desse limiar o job de reconciliação ainda pode fechar sozinho.
const AMBIGUOUS_THRESHOLD_MS = 2 * 60 * 1000;

export function useUnconfirmedMessages(
  conversationContactId: string | null | undefined,
  conversationGroupId?: string | null,
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unconfirmed-messages', conversationContactId ?? null, conversationGroupId ?? null],
    queryFn: async (): Promise<UnconfirmedQueryResult> => {
      if (!conversationContactId && !conversationGroupId) return { rows: [], schemaReady: true };
      const threshold = new Date(Date.now() - AMBIGUOUS_THRESHOLD_MS).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('messages')
        .select('id, content, created_at, delivery_post_started_at, status, contact_id, agent_id')
        .eq('sender', 'agent')
        .not('delivery_post_started_at', 'is', null)
        // Só 'sending' é ambígua: 'failed' com carimbo foi recusa DEFINITIVA do
        // provedor (fail_outbound_message), não pode virar "entregue" à mão.
        .eq('status', 'sending')
        .is('manually_resolved_at', null)
        .lt('delivery_post_started_at', threshold)
        .order('created_at', { ascending: false });
      if (conversationGroupId) {
        // Mensagens para grupo: contact_id é NULL, filtrar por whatsapp_group_id
        q = q.eq('whatsapp_group_id', conversationGroupId).is('contact_id', null);
      } else {
        q = q.eq('contact_id', conversationContactId);
      }
      const { data, error } = await q;
      if (error) {
        // Migration 20261111160000 ainda não aplicada (o front publica antes do
        // db-migrate): sem as colunas não existe mensagem ambígua a listar.
        if (isSchemaNotReadyError(error)) return { rows: [], schemaReady: false };
        throw error;
      }
      return { rows: (data ?? []) as unknown as UnconfirmedMessage[], schemaReady: true };
    },
    enabled: !!conversationContactId || !!conversationGroupId,
    // Pré-DDL não martela o PostgREST a cada 30 s: o polling só liga quando a
    // coluna existe (a próxima montagem/foco volta a checar).
    refetchInterval: (q) => (q.state.data?.schemaReady === false ? false : 30_000),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ messageId, outcome }: { messageId: string; outcome: 'sent' | 'not_delivered' }) => {
      // @ts-expect-error resolve_unconfirmed_message not in generated types until production migration
      const { data, error } = await supabase.rpc('resolve_unconfirmed_message', {
        p_message_id: messageId,
        p_outcome: outcome,
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['unconfirmed-messages', conversationContactId ?? null, conversationGroupId ?? null] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      const label = variables.outcome === 'sent' ? 'marcada como entregue' : 'marcada como não entregue';
      toast({ title: `Mensagem ${label}`, description: 'Status corrigido manualmente.' });
    },
    onError: (error: Error) => {
      const msg = isSchemaNotReadyError(error)
        ? 'Correção manual ainda indisponível. Tente mais tarde.'
        : error.message.includes('message_not_resolvable')
        ? 'Mensagem já resolvida ou não elegível.'
        : error.message.includes('admin_or_supervisor_required')
          ? 'Apenas admins e supervisores podem corrigir status.'
          : 'Erro ao corrigir status. Tente novamente.';
      toast({ title: 'Erro', description: msg, variant: 'destructive' });
    },
  });

  return {
    messages: query.data?.rows ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    resolve: resolveMutation.mutate,
    isResolving: resolveMutation.isPending,
    resolvingId: resolveMutation.isPending ? (resolveMutation.variables as { messageId: string } | undefined)?.messageId : null,
  };
}
