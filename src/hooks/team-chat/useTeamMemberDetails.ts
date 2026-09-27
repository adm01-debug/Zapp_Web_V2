import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TeamConversation } from './teamChatTypes';

export interface MemberProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string;
  birthday: string | null;
}

const PROFILE_FIELDS =
  'id, name, email, phone, avatar_url, job_title, department, role, is_active, created_at, birthday';

export function useTeamMemberDetails(
  conversation: TeamConversation,
  currentProfileId: string | null,
) {
  const otherMemberId = useMemo(
    () =>
      conversation.type === 'direct'
        ? (conversation.members?.find((m) => m.profile_id !== currentProfileId)?.profile_id ?? null)
        : null,
    [conversation, currentProfileId],
  );

  const memberIds = useMemo(
    () => conversation.members?.map((m) => m.profile_id) ?? [],
    [conversation.members],
  );

  const { data: memberProfile, isLoading } = useQuery({
    queryKey: ['team-member-profile', otherMemberId || conversation.id],
    queryFn: async () => {
      if (conversation.type === 'direct' && otherMemberId) {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_FIELDS)
          .eq('id', otherMemberId)
          .maybeSingle();
        if (error) throw error;
        return data as MemberProfile | null;
      }
      return null;
    },
    enabled: !!currentProfileId && conversation.type === 'direct' && !!otherMemberId,
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: ['team-group-members', conversation.id, memberIds.join(',')],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_FIELDS)
        .in('id', memberIds);
      if (error) throw error;
      return (data || []) as MemberProfile[];
    },
    enabled: !!currentProfileId && conversation.type === 'group' && memberIds.length > 0,
  });

  return { memberProfile: memberProfile ?? null, isLoading, groupMembers };
}
