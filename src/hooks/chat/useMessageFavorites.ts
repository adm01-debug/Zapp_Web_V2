import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** A02 — favoritar mensagem.
 *
 *  As tabelas `message_favorites`/`message_pins`/`message_reports` e as RPCs de
 *  favoritar/fixar/reportar/lembrar vêm dos cartões pais (t_3f7a2b9b e t_f025e4be)
 *  e ainda NÃO estão em `src/integrations/supabase/types.ts` (integração pendente
 *  no momento deste cartão). O cast abaixo é local e deliberado — mantém o app
 *  tipado e não escreve em `types.ts`, que pertence aos cartões de banco.
 *  Precedente no repositório: `useConnectionsManager.ts` (t_ae0a55a6). */

type QueryError = { message: string; code?: string } | null;

interface UntypedQuery {
  select: (columns?: string) => UntypedQuery;
  eq: (column: string, value: unknown) => UntypedQuery;
  order: (column: string, options?: { ascending?: boolean }) => UntypedQuery;
  then: <T>(onfulfilled: (value: { data: unknown; error: QueryError }) => T) => Promise<T>;
}

interface UntypedClient {
  from: (table: string) => UntypedQuery;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: QueryError }>;
}

const db = supabase as unknown as UntypedClient;

const EMPTY_FAVORITES: ReadonlySet<string> = new Set();

/** Chave da query do conjunto de favoritas de uma conversa (exportada para que
 *  outros módulos possam invalidar/ler o cache). */
export const messageFavoritesKey = (contactId: string) =>
  ['message-favorites', contactId] as const;

/** Mensagem de erro das RPCs de ação sobre mensagem. `message_not_visible` cobre
 *  tanto a mensagem inexistente quanto o contato sem acesso (a RPC não distingue,
 *  de propósito); `42501` é o SQLSTATE das recusas de permissão. */
function messageActionErrorMessage(error: QueryError): string {
  const token = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (token.includes('pin_limit_reached')) return 'Limite de 3 mensagens fixadas por conversa';
  if (token.includes('invalid_report_reason')) return 'Motivo de denúncia inválido';
  if (token.includes('invalid_report_note')) return 'A nota da denúncia deve ter até 500 caracteres';
  if (token.includes('remind_at_in_past')) return 'Escolha uma data futura para o lembrete';
  if (token.includes('remind_at_too_far')) return 'O lembrete pode ser no máximo 90 dias à frente';
  if (
    token.includes('message_not_visible') ||
    token.includes('not_authenticated') ||
    token.includes('auth_required') ||
    token.includes('42501')
  ) {
    return 'Você não tem permissão para esta ação nesta mensagem';
  }
  return 'Não foi possível concluir a ação';
}

export interface UseMessageFavoritesResult {
  favoriteIds: ReadonlySet<string>;
  isLoading: boolean;
  isFavorite: (messageId: string) => boolean;
  refetch: () => Promise<unknown>;
}

/** Conjunto das mensagens favoritadas pelo usuário logado NESTA conversa.
 *  A RLS de `message_favorites` já limita às linhas do próprio usuário; o filtro
 *  pelo contato vem da mensagem (join `messages!inner`), numa única ida ao banco. */
export function useMessageFavorites(contactId: string | null | undefined): UseMessageFavoritesResult {
  const query = useQuery({
    queryKey: messageFavoritesKey(contactId ?? ''),
    queryFn: async (): Promise<Set<string>> => {
      if (!contactId) return new Set<string>();
      const { data, error } = await db
        .from('message_favorites')
        .select('message_id, messages!inner(contact_id)')
        .eq('messages.contact_id', contactId);
      if (error) throw error;
      const rows = (data as Array<{ message_id: string }> | null) ?? [];
      return new Set(rows.map((row) => row.message_id));
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  const favoriteIds = query.data ?? EMPTY_FAVORITES;
  const isFavorite = useCallback((messageId: string) => favoriteIds.has(messageId), [favoriteIds]);

  return { favoriteIds, isLoading: query.isLoading, isFavorite, refetch: query.refetch };
}

export interface UseToggleMessageFavoriteResult {
  toggleFavorite: (messageId: string) => Promise<boolean>;
  isToggling: boolean;
}

/** Alterna o favorito com atualização otimista: aplica na hora no cache da
 *  conversa e desfaz (rollback) se a RPC recusar. A RPC devolve `true` quando a
 *  mensagem passou a ser favorita e `false` quando deixou de ser. */
export function useToggleMessageFavorite(): UseToggleMessageFavoriteResult {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (messageId: string): Promise<boolean> => {
      const { data, error } = await db.rpc('toggle_message_favorite', { p_message_id: messageId });
      if (error) throw error;
      return data === true;
    },
    onMutate: async (messageId) => {
      // Cancela releituras em voo para o otimismo não ser sobrescrito por uma
      // resposta atrasada (corrida).
      await queryClient.cancelQueries({ queryKey: ['message-favorites'] });
      const previous = queryClient.getQueriesData<Set<string>>({ queryKey: ['message-favorites'] });
      queryClient.setQueriesData<Set<string>>({ queryKey: ['message-favorites'] }, (current) => {
        const next = new Set(current ?? []);
        if (next.has(messageId)) next.delete(messageId);
        else next.add(messageId);
        return next;
      });
      return { previous };
    },
    onError: (error, _messageId, context) => {
      context?.previous.forEach(([key, value]) => queryClient.setQueryData(key, value));
      toast.error(messageActionErrorMessage(error as QueryError));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['message-favorites'] });
    },
  });

  const toggleFavorite = useCallback(
    (messageId: string) => mutation.mutateAsync(messageId),
    [mutation],
  );

  return { toggleFavorite, isToggling: mutation.isPending };
}
