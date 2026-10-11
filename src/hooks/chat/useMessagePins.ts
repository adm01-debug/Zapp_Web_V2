import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

/** A03 — fixar/desafixar mensagem (máximo de 3 por conversa).
 *
 *  `message_pins` e as RPCs `pin_message`/`unpin_message` vêm do cartão pai
 *  t_3f7a2b9b e ainda NÃO estão em `src/integrations/supabase/types.ts`
 *  (integração pendente). Cast local deliberado — ver `useMessageFavorites.ts`. */

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

/** Limite imposto pela RPC `pin_message`. A tela usa para avisar antes de tentar. */
export const PIN_LIMIT = 3;

export interface MessagePin {
  id: string;
  contact_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
}

export const messagePinsKey = (contactId: string) => ['message-pins', contactId] as const;

const EMPTY_PINS: MessagePin[] = [];

function pinErrorMessage(error: QueryError): string {
  const token = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (token.includes('pin_limit_reached') || token.includes('23514')) {
    return 'Limite de 3 mensagens fixadas por conversa';
  }
  if (
    token.includes('message_not_visible') ||
    token.includes('not_authenticated') ||
    token.includes('42501')
  ) {
    return 'Você não tem permissão para fixar esta mensagem';
  }
  return 'Não foi possível concluir a ação';
}

export interface UseMessagePinsResult {
  pins: MessagePin[];
  isLoading: boolean;
  isPinned: (messageId: string) => boolean;
  pin: (messageId: string) => Promise<string>;
  unpin: (messageId: string) => Promise<boolean>;
  isPinning: boolean;
  isUnpinning: boolean;
  refetch: () => Promise<unknown>;
}

/** Lista as mensagens fixadas da conversa, com assinatura de realtime por contato.
 *
 *  Ordem determinística: `pinned_at` desc com `id` desc como desempate (duas
 *  fixações no mesmo instante não trocam de posição entre releituras). */
export function useMessagePins(contactId: string | null | undefined): UseMessagePinsResult {
  const queryClient = useQueryClient();
  const key = messagePinsKey(contactId ?? '');

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<MessagePin[]> => {
      if (!contactId) return [];
      const { data, error } = await db
        .from('message_pins')
        .select('id, contact_id, message_id, pinned_by, pinned_at')
        .eq('contact_id', contactId)
        .order('pinned_at', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;
      return ((data as MessagePin[] | null) ?? []);
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  // Realtime no padrão do app (useMessageStatus/useMessageReactions): qualquer
  // pin/unpin da conversa revalida a lista, inclusive o fixado por outro agente.
  useEffect(() => {
    if (!contactId) return;
    const channel = supabase
      .channel(`message-pins:${contactId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_pins', filter: `contact_id=eq.${contactId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: messagePinsKey(contactId) });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [contactId, queryClient]);

  const pinMutation = useMutation({
    mutationFn: async (messageId: string): Promise<string> => {
      const { data, error } = await db.rpc('pin_message', { p_message_id: messageId });
      if (error) throw error;
      return data as string;
    },
    onMutate: async (messageId) => {
      const listKey = messagePinsKey(contactId ?? '');
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<MessagePin[]>(listKey);
      queryClient.setQueryData<MessagePin[]>(listKey, (current) => {
        const list = current ?? [];
        if (list.some((p) => p.message_id === messageId)) return list;
        const otimista: MessagePin = {
          id: `optimistic-${messageId}`,
          contact_id: contactId ?? '',
          message_id: messageId,
          pinned_by: '',
          pinned_at: new Date().toISOString(),
        };
        return [otimista, ...list];
      });
      return { previous };
    },
    onError: (error, _messageId, context) => {
      if (context) queryClient.setQueryData(messagePinsKey(contactId ?? ''), context.previous);
      toast.error(pinErrorMessage(error as QueryError));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messagePinsKey(contactId ?? '') });
    },
  });

  const unpinMutation = useMutation({
    mutationFn: async (messageId: string): Promise<boolean> => {
      const { data, error } = await db.rpc('unpin_message', { p_message_id: messageId });
      if (error) throw error;
      return data === true;
    },
    onMutate: async (messageId) => {
      const listKey = messagePinsKey(contactId ?? '');
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<MessagePin[]>(listKey);
      queryClient.setQueryData<MessagePin[]>(listKey, (current) =>
        (current ?? []).filter((p) => p.message_id !== messageId),
      );
      return { previous };
    },
    onError: (error, _messageId, context) => {
      if (context) queryClient.setQueryData(messagePinsKey(contactId ?? ''), context.previous);
      toast.error(pinErrorMessage(error as QueryError));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: messagePinsKey(contactId ?? '') });
    },
  });

  const pins = query.data ?? EMPTY_PINS;
  const isPinned = useCallback(
    (messageId: string) => pins.some((p) => p.message_id === messageId),
    [pins],
  );
  const pin = useCallback((messageId: string) => pinMutation.mutateAsync(messageId), [pinMutation]);
  const unpin = useCallback((messageId: string) => unpinMutation.mutateAsync(messageId), [unpinMutation]);

  return {
    pins,
    isLoading: query.isLoading,
    isPinned,
    pin,
    unpin,
    isPinning: pinMutation.isPending,
    isUnpinning: unpinMutation.isPending,
    refetch: query.refetch,
  };
}
