import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { teamChatKeys } from './queryKeys';

export function useTeamReadState(conversationId: string | null) {
  return useQuery({
    queryKey: teamChatKeys.readState(conversationId ?? ''),
    queryFn: async () => {
      if (!conversationId) return new Set<string>();
      const { data, error } = await supabase
        .from('team_message_receipts')
        .select('message_id')
        .eq('conversation_id', conversationId);
      if (error) throw error;
      return new Set((data ?? []).map((r: { message_id: string }) => r.message_id));
    },
    enabled: !!conversationId,
    staleTime: 30_000,
  });
}

export function useIsMessageRead(conversationId: string | null, messageId: string): boolean {
  const { data: readSet } = useTeamReadState(conversationId);
  return useMemo(() => readSet?.has(messageId) ?? false, [readSet, messageId]);
}
