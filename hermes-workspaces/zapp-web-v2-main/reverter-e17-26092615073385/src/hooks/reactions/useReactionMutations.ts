import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';

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

      const { data, error } = await supabase
        .from('message_reactions')
        .upsert(
          { message_id: messageId, user_id: profileId, contact_id: contactId, emoji },
          { onConflict: 'message_id,user_id,emoji' }
        )
        .select()
        .single();

      if (error) throw error;

      if (options?.instanceName && options?.contactJid && options?.externalId) {
        try {
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
        } catch (err) {
          log.error('Failed to send reaction via Evolution API', err);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-reactions', messageId] });
    },
    onError: (error) => {
      log.error('Failed to add reaction', error);
      toast({ title: 'Erro ao adicionar reação', variant: 'destructive' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (emoji: string) => {
      if (!profileId) throw new Error('Perfil não encontrado');

      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', profileId)
        .eq('emoji', emoji);

      if (error) throw error;

      if (options?.instanceName && options?.contactJid && options?.externalId) {
        try {
          await sendReaction(
            options.instanceName,
            {
              remoteJid: options.contactJid,
              fromMe: options.senderType === 'agent',
              id: options.externalId,
            },
            ''
          );
        } catch (err) {
          log.error('Failed to remove reaction via Evolution API', err);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-reactions', messageId] });
    },
  });

  return { addMutation, removeMutation };
}
