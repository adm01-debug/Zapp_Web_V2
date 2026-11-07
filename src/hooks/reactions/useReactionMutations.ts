import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { messageReactionsQueryKey } from './useBatchReactions';
import type { MessageReaction } from './types';

interface ReactionMutationOptions {
  instanceName?: string;
  contactJid?: string;
  externalId?: string;
  senderType?: 'contact' | 'agent';
}

export const reactionMutationKey = (messageId: string) => ['message-reaction-mutation', messageId] as const;

export function useReactionMutations(
  messageId: string,
  profileId: string | undefined,
  options?: ReactionMutationOptions
) {
  const queryClient = useQueryClient();
  const { sendReaction } = useEvolutionApi();
  const mutationScope = { id: `message-reaction:${messageId}:${profileId ?? 'anonymous'}` };

  const resolveMessageContactId = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('contact_id')
      .eq('id', messageId)
      .maybeSingle();

    if (error) throw error;

    if (!data?.contact_id) {
      throw new Error('Contato da mensagem não encontrado');
    }

    return data.contact_id;
  };

  const transport = options?.instanceName && options.contactJid && options.externalId
    ? {
        instanceName: options.instanceName,
        key: {
          remoteJid: options.contactJid,
          fromMe: options.senderType === 'agent',
          id: options.externalId,
        },
      }
    : null;

  const readCurrentReaction = async () => {
    if (!profileId) return null;
    const { data, error } = await supabase
      .from('message_reactions')
      .select('*')
      .eq('message_id', messageId)
      .eq('user_id', profileId)
      .maybeSingle();
    if (error) throw error;
    return data;
  };

  // Banco é a autoridade de ordenação entre abas/dispositivos. Depois de cada
  // commit, publique o estado corrente e confira se ele permaneceu igual durante
  // o envio. Se outra aba ganhou no intervalo, repita com o novo vencedor.
  const reconcileTransportWithDatabase = async () => {
    if (!transport) return null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await readCurrentReaction();
      await sendReaction(transport.instanceName, transport.key, before?.emoji ?? '');
      const after = await readCurrentReaction();
      if ((before?.id ?? null) === (after?.id ?? null) && (before?.emoji ?? '') === (after?.emoji ?? '')) {
        return after;
      }
    }
    throw new Error('Estado da reação mudou repetidamente durante a sincronização');
  };

  const addMutation = useMutation({
    mutationKey: reactionMutationKey(messageId),
    scope: mutationScope,
    mutationFn: async (emoji: string) => {
      if (!profileId) throw new Error('Perfil não encontrado');

      const contactId = await resolveMessageContactId();

      // R2-INB-032: o transporte vem ANTES da gravação local. A linha em
      // `message_reactions` é a fonte dos badges e do `hasReacted` da tela, então
      // só pode ser confirmada depois que a Evolution aceitou a reação. Na ordem
      // antiga a rejeição do envio era engolida pelo catch, a mutation resolvia e
      // a query era invalidada como se tivesse dado certo.
      if (transport) {
        await sendReaction(
          transport.instanceName,
          transport.key,
          emoji
        );
        log.info('Reaction sent via Evolution API', { emoji, messageId });
      }

      let inserted;
      try {
        const { data, error } = await supabase
          .from('message_reactions')
          .upsert(
            { message_id: messageId, user_id: profileId, contact_id: contactId, emoji },
            { onConflict: 'message_id,user_id' }
          )
          .select()
          .maybeSingle();

        if (error) throw error;
        inserted = data;
      } catch (error) {
        // A Evolution já aceitou, mas a fonte local dos badges recusou. Faça a
        // compensação inversa somente depois de um readback conclusivo. Erro
        // HTTP pode chegar após COMMIT; compensar no escuro inverteria a
        // divergência (banco gravado + WhatsApp removido).
        if (transport) {
          let stored: Awaited<ReturnType<typeof readCurrentReaction>> | undefined;
          try {
            stored = await readCurrentReaction();
            await reconcileTransportWithDatabase();
          } catch (readbackError) {
            log.error('Failed to verify local reaction after ambiguous add failure', readbackError);
          }
          if (stored?.emoji === emoji) return stored;
        }
        throw error;
      }
      if (transport) inserted = await reconcileTransportWithDatabase() ?? inserted;
      return inserted;
    },
    onSuccess: (inserted, emoji) => {
      // O lote de reações pode ter semeado `[]` no cache. Confirmada a escrita,
      // publique a linha imediatamente para os dois consumidores do balão
      // (barra rápida e badges); o refetch abaixo reconcilia nomes/estado remoto.
      // Depender só da invalidação deixava o badge ausente até outra atualização.
      if (inserted) {
        queryClient.setQueryData<MessageReaction[]>(
          messageReactionsQueryKey(messageId),
          (current = []) => [
            ...current.filter((reaction) => !(
              reaction.message_id === messageId
              && reaction.user_id === profileId
            )),
            { ...inserted, user_name: 'Você' } as MessageReaction,
          ],
        );
      }
      void queryClient.invalidateQueries({ queryKey: messageReactionsQueryKey(messageId) });
    },
    onError: (error) => {
      log.error('Failed to add reaction', error);
      toast({ title: 'Erro ao adicionar reação', variant: 'destructive' });
    },
  });

  const removeMutation = useMutation({
    mutationKey: reactionMutationKey(messageId),
    scope: mutationScope,
    mutationFn: async (emoji: string) => {
      if (!profileId) throw new Error('Perfil não encontrado');

      // R2-INB-032: mesma ordem do add — o transporte primeiro. Se a Evolution
      // rejeitar o envio, o DELETE local não roda e a reação que já existia
      // continua valendo (antes, o delete acontecia primeiro e a rejeição era
      // engolida pelo catch).
      if (transport) {
        await sendReaction(
          transport.instanceName,
          transport.key,
          ''
        );
        log.info('Reaction removed via Evolution API', { emoji, messageId });
      }

      try {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', profileId)
          .eq('emoji', emoji);

        if (error) throw error;
      } catch (error) {
        // DELETE local falhou depois da remoção remota: restaure no provedor a
        // reação somente se o readback provar que o banco ainda a conserva.
        if (transport) {
          let stored: Awaited<ReturnType<typeof readCurrentReaction>> | undefined;
          try {
            stored = await readCurrentReaction();
            await reconcileTransportWithDatabase();
          } catch (readbackError) {
            log.error('Failed to verify local reaction after ambiguous remove failure', readbackError);
          }
          if (!stored || stored.emoji !== emoji) return;
        }
        throw error;
      }
      if (transport) await reconcileTransportWithDatabase();
    },
    onSuccess: (_data, emoji) => {
      queryClient.setQueryData<MessageReaction[]>(
        messageReactionsQueryKey(messageId),
        (current = []) => current.filter((reaction) => !(
          reaction.message_id === messageId
          && reaction.user_id === profileId
          && reaction.emoji === emoji
        )),
      );
      void queryClient.invalidateQueries({ queryKey: messageReactionsQueryKey(messageId) });
    },
    onError: (error) => {
      log.error('Failed to remove reaction', error);
      toast({ title: 'Erro ao remover reação', variant: 'destructive' });
    },
  });

  return { addMutation, removeMutation };
}
