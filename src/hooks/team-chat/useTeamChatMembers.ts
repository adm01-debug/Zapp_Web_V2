import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import { toast } from 'sonner';

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
      if (newIds.length === 0) return;
      const { error } = await supabase
        .from('team_conversation_members')
        .insert(newIds.map(pid => ({ conversation_id: conversationId, profile_id: pid })));
      if (error) throw error;
      return newIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['team-messages', conversationId] });
      toast.success(`${count ?? 0} membro(s) adicionado(s)`);
      onSuccess?.(count ?? 0);
    },
    onError: () => {
      toast.error('Erro ao adicionar membros');
    },
  });
}
