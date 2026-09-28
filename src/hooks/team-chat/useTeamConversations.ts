import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { teamChatKeys } from './queryKeys';
import type { TeamConversation, TeamConversationInbox, TeamMember, TeamMessage } from './teamChatTypes';

function toTeamConversation(row: TeamConversationInbox, myProfileId: string): TeamConversation {
  let displayName = row.name;
  if (row.type === 'direct' && !row.name) {
    const other = row.members.find(m => m.profile_id !== myProfileId);
    displayName = other?.display_name ?? 'Chat Direto';
  }
  return {
    id: row.conversation_id,
    type: row.type,
    name: displayName,
    avatar_url:
      row.type === 'direct' && !row.avatar_url
        ? (row.members.find(m => m.profile_id !== myProfileId)?.avatar_url ?? null)
        : row.avatar_url,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    department_id: row.department_id,
    member_role: row.member_role,
    is_pinned: row.is_pinned,
    is_archived: row.is_archived,
    is_muted: row.is_muted,
    last_read_at: row.last_read_at,
    members: row.members.map((m): TeamMember => ({
      id: `${row.conversation_id}:${m.profile_id}`,
      conversation_id: row.conversation_id,
      profile_id: m.profile_id,
      joined_at: '',
      last_read_at: null,
      is_muted: false,
      member_role: m.role as 'admin' | 'member' | 'viewer',
      profile: {
        id: m.profile_id,
        name: m.display_name ?? '',
        email: null,
        avatar_url: m.avatar_url,
        is_active: true,
      },
    })),
    last_message: row.last_message_id
      ? ({
          id: row.last_message_id,
          conversation_id: row.conversation_id,
          sender_id: row.last_message_sender_id!,
          content: row.last_message_content!,
          message_type: row.last_message_type ?? 'text',
          status: 'delivered',
          media_url: null,
          media_type: null,
          media_bucket: null,
          media_path: null,
          reply_to_id: null,
          is_edited: false,
          created_at: row.last_message_created_at!,
          updated_at: row.last_message_created_at!,
        } satisfies TeamMessage)
      : null,
    unread_count: row.unread_count,
  };
}

export function useTeamConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const channelName = useMemo(
    () => `team:convs:${crypto.randomUUID().slice(0, 8)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const query = useQuery({
    queryKey: teamChatKeys.conversations(),
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase.rpc('get_team_conversations');
      if (error) throw error;
      return ((data ?? []) as TeamConversationInbox[]).map(row =>
        toTeamConversation(row, profile.id),
      );
    },
    enabled: !!profile,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => {
        void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversation_members' }, () => {
        void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_message_receipts' }, () => {
        void queryClient.invalidateQueries({ queryKey: teamChatKeys.conversations() });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile, queryClient, channelName]);

  return query;
}
