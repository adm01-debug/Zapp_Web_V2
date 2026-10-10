import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import type { TeamConversation, TeamMember, TeamMessage } from './teamChatTypes';

export function useTeamConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['team-conversations', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      const { data: memberships, error: memErr } = await supabase
        .from('team_conversation_members')
        .select('conversation_id, last_read_at, is_muted, is_pinned, is_archived, member_role')
        .eq('profile_id', profile.id);

      if (memErr) throw memErr;
      if (!memberships?.length) return [];

      const convIds = memberships.map(m => m.conversation_id);

      const [convResult, membersResult, previewsResult, unreadResult] = await Promise.all([
        supabase
          .from('team_conversations')
          .select('*')
          .in('id', convIds)
          .order('updated_at', { ascending: false }),
        supabase
          .from('team_conversation_members')
          .select('*, profile:profiles(id, name, email, avatar_url, is_active)')
          .in('conversation_id', convIds),
        supabase.rpc('get_team_conversation_previews'),
        supabase.rpc('get_team_unread_counts'),
      ]);

      if (convResult.error) throw convResult.error;
      const conversations = convResult.data || [];
      const allMembers = membersResult.data || [];

      const previewMap = new Map<string, {
        last_message_id: string;
        last_message_content: string;
        last_message_type: string;
        last_message_sender_id: string;
        last_message_created_at: string;
      }>();
      for (const p of (previewsResult.data || [])) {
        previewMap.set(p.conversation_id, p);
      }

      const unreadMap = new Map<string, number>();
      for (const u of (unreadResult.data || [])) {
        unreadMap.set(u.conversation_id, Number(u.unread_count) || 0);
      }

      const enriched: TeamConversation[] = conversations.map(conv => {
        const members = ((allMembers || []).filter(m => m.conversation_id === conv.id)) as unknown as TeamMember[];
        const preview = previewMap.get(conv.id);

        let displayName = conv.name;
        if (conv.type === 'direct' && !conv.name) {
          const other = members.find(m => m.profile_id !== profile.id);
          displayName = other?.profile?.name || 'Chat Direto';
        }

        const lastMsg: TeamMessage | null = preview
          ? {
              id: preview.last_message_id,
              conversation_id: conv.id,
              sender_id: preview.last_message_sender_id,
              content: preview.last_message_content,
              message_type: preview.last_message_type,
              status: 'delivered',
              media_url: null,
              media_type: null,
              media_bucket: null,
              media_path: null,
              reply_to_id: null,
              is_edited: false,
              created_at: preview.last_message_created_at,
              updated_at: preview.last_message_created_at,
            }
          : null;

        return {
          ...conv,
          type: conv.type as 'direct' | 'group',
          name: displayName,
          avatar_url: conv.type === 'direct' && !conv.avatar_url
            ? members.find(m => m.profile_id !== profile.id)?.profile?.avatar_url ?? null
            : conv.avatar_url,
          members,
          last_message: lastMsg,
          unread_count: unreadMap.get(conv.id) || 0,
        };
      });

      return enriched;
    },
    enabled: !!profile,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('team-chat-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_conversation_members' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'team_message_receipts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['team-conversations'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, queryClient]);

  return query;
}
