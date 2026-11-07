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

export function useReactionMutations(
  messageId: string,
  profileId: string | undefined,
  options?: ReactionMutationOptions
) {
  const queryClient = useQueryClient();
  const { sendReaction } = useEvolutionApi();

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

  const addMutation = useMutation({
    mutationFn: async (emoji: string) => {
      if (!profileId) throw new Error('Perfil não encontrado');

      const contactId = await resolveMessageContactId();

      // R2-INB-032: o transporte vem ANTES da gravação local. A linha em
      // `message_reactions` é a fonte dos badges e do `hasReacted` da tela, então
      // só pode ser confirmada depois que a Evolution aceitou a reação. Na ordem
      // antiga a rejeição do envio era engolida pelo catch, a mutation resolvia e
      // a query era invalidada como se tivesse dado certo.
      if (options?.instanceName && options?.contactJid && options?.externalId) {
        await sendReaction(
          options.instanceName,
          {
            remoteJid: options.contactJid,
            fromMe: options.senderType === 'agent',
            id: options.externalId,
          },
          emoji
        );
        log.info('Reaction sent via Evolution API', { emoji, messageId });
      }

      const { data, error } = await supabase
        .from('message_reactions')
        .upsert(
          { message_id: messageId, user_id: profileId, contact_id: contactId, emoji },
          { onConflict: 'message_id,user_id,emoji' }
        )
        .select()
        .maybeSingle();

      if (error) throw error;

      return data;
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
              && reaction.emoji === emoji
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
    mutationFn: async (emoji: string) => {
      if (!profileId) throw new Error('Perfil não encontrado');

      // R2-INB-032: mesma ordem do add — o transporte primeiro. Se a Evolution
      // rejeitar o envio, o DELETE local não roda e a reação que já existia
      // continua valendo (antes, o delete acontecia primeiro e a rejeição era
      // engolida pelo catch).
      if (options?.instanceName && options?.contactJid && options?.externalId) {
        await sendReaction(
          options.instanceName,
          {
            remoteJid: options.contactJid,
            fromMe: options.senderType === 'agent',
            id: options.externalId,
          },
          ''
        );
        log.info('Reaction removed via Evolution API', { emoji, messageId });
      }

      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', profileId)
        .eq('emoji', emoji);

      if (error) throw error;
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
