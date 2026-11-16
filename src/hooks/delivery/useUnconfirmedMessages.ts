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
// Abaixo desse limiar o envio ainda pode estar em voo (lease de 90s) ou o recibo do
// webhook ainda pode chegar e fechar a linha sozinho.
const AMBIGUOUS_THRESHOLD_MS = 2 * 60 * 1000;

const POLL_MS = 30_000;
const ERROR_BACKOFF_BASE_MS = 60_000;
const ERROR_BACKOFF_MAX_MS = 10 * 60_000;

/**
 * Falhas SEGUIDAS por INSTANCIA de query, para o recuo abaixo.
 *
 * Nao da para usar o `errorUpdateCount` do react-query: ele e' o total de erros da sessao
 * e NAO zera no sucesso, entao `erro x4, sucesso, erro` cobraria 10 min pela primeira
 * falha depois da recuperacao. Tambem nao serve o `fetchFailureCount`, que conta
 * tentativa DENTRO de uma busca e zera a cada nova.
 *
 * A chave e' o objeto da query, nao o `queryHash`: o hash e' estavel, e uma conversa
 * fechada por mais que o `gcTime` (30 min, `src/lib/queryClient.ts`) sai do cache e volta
 * como query NOVA. Com chave por hash, ela herdaria a contagem antiga e a primeira falha
 * da nova consulta ja cobraria 10 min. Sendo `WeakMap` por instancia, a entrada morre com
 * a query -- sem herdar historico e sem precisar de teto de tamanho.
 *
 * Achados da Devin e do Codex na PR #3194.
 */
const falhasSeguidas = new WeakMap<object, { errosVistos: number; seguidas: number }>();

/**
 * Intervalo do polling a partir do estado da query.
 *
 * Em regime normal o painel repergunta a cada 30 s. Sob ERRO o intervalo dobra a cada
 * falha SEGUIDA (1, 2, 4, 8 min, teto de 10) e volta a 30 s no primeiro sucesso, que
 * tambem zera a contagem. Sem isso, uma falha persistente -- permissao negada, RPC fora
 * do schema cache, instabilidade do banco -- faz cada conversa aberta bater de 30 em
 * 30 s para sempre, somando carga justamente quando o banco ja esta em dificuldade.
 *
 * O `UnconfirmedMessagesPanel` esconde o painel enquanto a consulta esta em erro e nao
 * oferece recarga manual, entao o recuo nao pode herdar historico: o preco de errar para
 * cima e' o painel sumir por 10 min por causa de uma falha so.
 *
 * SO o sucesso zera a contagem. O react-query poe `status: 'pending'` ao comecar uma
 * busca enquanto `data` ainda e' `undefined`, e o callback e' reavaliado nessa transicao
 * -- numa consulta que falha desde a abertura a sequencia e' `pending -> error ->
 * pending -> error`, e zerar em `pending` prendia o recuo em 1 min.
 *
 * O callback e' reavaliado a cada render, nao so' na troca de estado; por isso a mesma
 * falha nao e' contada duas vezes -- o `errorUpdateCount` serve de identidade do erro,
 * nao de contador.
 */
export function unconfirmedRefetchInterval(q: {
  state: { status: string; errorUpdateCount?: number };
}): number {
  if (q.state.status !== 'error') {
    if (q.state.status === 'success') falhasSeguidas.delete(q);
    return POLL_MS;
  }
  const errosVistos = q.state.errorUpdateCount ?? 1;
  const anterior = falhasSeguidas.get(q);
  const seguidas = anterior === undefined
    ? 1
    : anterior.errosVistos === errosVistos
      ? anterior.seguidas
      : anterior.seguidas + 1;
  falhasSeguidas.set(q, { errosVistos, seguidas });
  return Math.min(ERROR_BACKOFF_BASE_MS * 2 ** (seguidas - 1), ERROR_BACKOFF_MAX_MS);
}

export function useUnconfirmedMessages(
  conversationContactId: string | null | undefined,
  conversationGroupId?: string | null,
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['unconfirmed-messages', conversationContactId ?? null, conversationGroupId ?? null],
    queryFn: async () => {
      if (!conversationContactId && !conversationGroupId) return [];
      const threshold = new Date(Date.now() - AMBIGUOUS_THRESHOLD_MS).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('messages')
        .select('id, content, created_at, delivery_post_started_at, status, contact_id, agent_id')
        .eq('sender', 'agent')
        .not('delivery_post_started_at', 'is', null)
        // Só 'sending' é ambígua: 'failed' com carimbo é resultado DEFINITIVO (recusa 4xx
        // do provedor em fail_outbound_message, ERROR do webhook ou "não entregue" já
        // resolvido aqui) e não pode virar "entregue" à mão.
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
      if (error) throw error;
      return (data ?? []) as unknown as UnconfirmedMessage[];
    },
    enabled: !!conversationContactId || !!conversationGroupId,
    refetchInterval: unconfirmedRefetchInterval,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ messageId, outcome }: { messageId: string; outcome: 'sent' | 'not_delivered' }) => {
      // RPC da migration 20261111160000: chamada sem tipo para compilar antes e depois do types-sync.
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>)('resolve_unconfirmed_message', {
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
      // Já resolvida/não elegível (P0002): a linha saiu do estado ambíguo — recarrega a
      // lista para ela sumir do painel em vez de esperar o próximo refetch de 30s.
      if (error.message.includes('message_not_resolvable')) {
        queryClient.invalidateQueries({ queryKey: ['unconfirmed-messages', conversationContactId ?? null, conversationGroupId ?? null] });
      }
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
