import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { teamChatKeys } from './queryKeys';

export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.rpc('mark_team_messages_read', {
        p_conversation_id: conversationId,
      });
      if (error) throw error;
      return data as { success: boolean; receipts_updated: number };
    },
    onSuccess: (_, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
      void queryClient.invalidateQueries({ queryKey: teamChatKeys.readState(conversationId) });
    },
  });
}
