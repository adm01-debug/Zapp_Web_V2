import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
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

/**
 * Linha devolvida pela RPC segura `get_team_profiles` (SECURITY DEFINER, so ativos).
 * O contrato NAO inclui `birthday` — ver migration 20260830170000.
 */
type TeamProfileRow = Database['public']['Functions']['get_team_profiles']['Returns'][number];

function toMemberProfile(row: TeamProfileRow): MemberProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    avatar_url: row.avatar_url ?? null,
    job_title: row.job_title ?? null,
    department: row.department ?? null,
    role: row.role ?? null,
    is_active: row.is_active ?? null,
    created_at: row.created_at,
    // `birthday` nao pertence ao contrato seguro: a RPC nao o fornece e nao ha
    // outra fonte permitida para ler o perfil de um colega. Mantem o campo para
    // o formato consumido pela tela, sempre null.
    birthday: null,
  };
}

/**
 * Carrega colegas APENAS pela RPC `get_team_profiles`.
 *
 * Ler `profiles` direto para ver outro colaborador e bloqueado pelo RLS para
 * agentes (cada usuario so ve o proprio perfil). A RPC nao aceita filtro de IDs,
 * entao ela e chamada uma vez e o retorno e reduzido aos IDs da conversa.
 */
async function loadConversationMembers(profileIds: string[]): Promise<MemberProfile[]> {
  if (profileIds.length === 0) return [];
  const { data, error } = await supabase.rpc('get_team_profiles');
  if (error) throw error;
  const wanted = new Set(profileIds);
  return ((data ?? []) as TeamProfileRow[])
    .filter((row) => wanted.has(row.id))
    .map(toMemberProfile);
}

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
      if (conversation.type !== 'direct' || !otherMemberId) return null;
      const [found] = await loadConversationMembers([otherMemberId]);
      return found ?? null;
    },
    enabled: !!currentProfileId && conversation.type === 'direct' && !!otherMemberId,
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: ['team-group-members', conversation.id, memberIds.join(',')],
    queryFn: () => loadConversationMembers(memberIds),
    enabled: !!currentProfileId && conversation.type === 'group' && memberIds.length > 0,
  });

  return { memberProfile: memberProfile ?? null, isLoading, groupMembers };
}
