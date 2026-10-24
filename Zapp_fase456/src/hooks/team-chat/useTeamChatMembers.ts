import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import { toast } from 'sonner';
import { queryKeys } from './queryKeys';

export function useActiveTeamProfiles(enabled = true) {
  const { data = [], isLoading } = useTeamProfiles(enabled);
  const active = useMemo(() => data.filter(p => p.is_active !== false), [data]);
  return { profiles: active, isLoading };
}

interface AddMembersOptions {
  conversationId: string;
  existingMemberIds: Set<string>;
  onSuccess?: (count: number) => void;
}

export function useAddConversationMembers({ conversationId, existingMemberIds, onSuccess }: AddMembersOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberIds: string[]) => {
      const newIds = memberIds.filter(id => !existingMemberIds.has(id));
      // HZ2-017: entre abrir o diálogo e clicar, outra pessoa pode ter inserido os
      // membros. Aí não há insert a fazer — devolver 0 e invalidar o cache anunciava
      // "0 membro(s) adicionado(s)" como se fosse sucesso.
      if (newIds.length === 0) return { added: 0, allAlreadyMembers: true };
      const { error } = await supabase
        .from('team_conversation_members')
        .insert(newIds.map(pid => ({ conversation_id: conversationId, profile_id: pid })));
      if (error) throw error;
      return { added: newIds.length, allAlreadyMembers: false };
    },
    onSuccess: ({ added, allAlreadyMembers }) => {
      // Nada mudou no banco: avisa o operador e NÃO invalida o cache (não houve
      // insert) nem dispara o `onSuccess` do chamador, que fecharia o diálogo como
      // se membros tivessem entrado. O diálogo fica aberto e converge pelo realtime.
      if (allAlreadyMembers) {
        toast.info('Esses usuários já fazem parte da conversa');
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox() });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages(conversationId) });
      toast.success(`${added} membro(s) adicionado(s)`);
      onSuccess?.(added);
    },
    onError: () => {
      toast.error('Erro ao adicionar membros');
    },
  });
}
