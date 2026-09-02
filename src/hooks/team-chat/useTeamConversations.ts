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
        .select('conversation_id, last_read_at')
        .eq('profile_id', profile.id);

      if (memErr) throw memErr;
      if (!memberships?.length) return [];

      const convIds = memberships.map(m => m.conversation_id);
      const lastReadMap = new Map(memberships.map(m => [m.conversation_id, m.last_read_at]));

      const [convResult, membersResult] = await Promise.all([
        supabase
          .from('team_conversations')
          .select('*')
          .in('id', convIds)
          .order('updated_at', { ascending: false }),
        supabase
          .from('team_conversation_members')
          .select('*, profile:profiles(id, name, email, avatar_url, is_active)')
          .in('conversation_id', convIds),
      ]);

      if (convResult.error) throw convResult.error;
      const conversations = convResult.data || [];
      const allMembers = membersResult.data || [];

      const { data: recentMessages } = await supabase
        .from('team_messages')
        .select('id, conversation_id, content, sender_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(convIds.length * 2);

      const lastMessageMap = new Map<string, { id: string; conversation_id: string; content: string; sender_id: string; created_at: string }>();
      for (const msg of recentMessages || []) {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg);
        }
      }

      const unreadPromises = convIds.map(async (cid) => {
        const lastRead = lastReadMap.get(cid);
        let query = supabase
          .from('team_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', cid)
          .neq('sender_id', profile.id);

        if (lastRead) {
          query = query.gt('created_at', lastRead);
        }

        const { count } = await query;
        return { cid, count: count || 0 };
      });

      const unreadResults = await Promise.all(unreadPromises);
      const unreadMap = new Map(unreadResults.map(r => [r.cid, r.count]));

      const enriched: TeamConversation[] = conversations.map(conv => {
        const members = ((allMembers || []).filter(m => m.conversation_id === conv.id)) as unknown as TeamMember[];
        const lastMsg = lastMessageMap.get(conv.id) || null;

        let displayName = conv.name;
        if (conv.type === 'direct' && !conv.name) {
          const other = members.find(m => m.profile_id !== profile.id);
          displayName = other?.profile?.name || 'Chat Direto';
        }

        return {
          ...conv,
          type: conv.type as 'direct' | 'group',
          name: displayName,
          avatar_url: (conv.type === 'direct' && !conv.avatar_url
            ? members.find(m => m.profile_id !== profile.id)?.profile?.avatar_url
            : conv.avatar_url) ?? null,
          members,
          last_message: lastMsg as TeamMessage | null,
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
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, queryClient]);

  return query;
}
