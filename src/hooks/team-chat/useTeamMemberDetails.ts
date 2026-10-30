import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import type { Database } from '@/integrations/supabase/types';
import type { TeamConversation } from './teamChatTypes';
import type { MemberBirthday } from '@/lib/birthday';
import { queryKeys } from './queryKeys';

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
  birthday: MemberBirthday | null;
}

/**
 * Linha devolvida pela RPC segura `get_team_profiles` (SECURITY DEFINER, so ativos).
 * O contrato NAO inclui `birthday` — ver migration 20260830170000.
 */
type TeamProfileRow = Database['public']['Functions']['get_team_profiles']['Returns'][number];

/**
 * Linha da RPC `get_team_birthdays` (migration 20261016102337, HZ-28): apenas
 * `id`, `birthday_day` e `birthday_month` dos perfis ativos — o ano nunca sai do banco.
 */
type TeamBirthdayRow = Database['public']['Functions']['get_team_birthdays']['Returns'][number];

function toMemberProfile(
  row: TeamProfileRow,
  birthdays: Map<string, MemberBirthday>,
): MemberProfile {
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
    // Dia/mes vem da RPC `get_team_birthdays`; quem nao tem aniversario cadastrado
    // (ou esta inativo, o que a RPC ja filtra) continua com `birthday: null`.
    birthday: birthdays.get(row.id) ?? null,
  };
}

/**
 * Aniversarios da equipe pela RPC segura: uma chamada devolve a lista inteira de perfis
 * ativos com dia/mes — a chave de cache e uma so (`queryKeys.teamBirthdays()`).
 */
async function rpcTeamBirthdays(): Promise<Map<string, MemberBirthday>> {
  const { data, error } = await supabase.rpc('get_team_birthdays');
  if (error) throw error;
  const porPerfil = new Map<string, MemberBirthday>();
  for (const row of (data ?? []) as TeamBirthdayRow[]) {
    porPerfil.set(row.id, { day: row.birthday_day, month: row.birthday_month });
  }
  return porPerfil;
}

/** Identidade estavel para o caso "sem aniversarios", sem recriar o Map a cada render. */
const SEM_ANIVERSARIOS: Map<string, MemberBirthday> = new Map();

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

  // Fonte unica dos colegas: `useTeamProfiles` usa a chave compartilhada
  // `['team-profiles-rpc']`, entao conversa direta e grupo (e as outras telas que a
  // usam) reaproveitam UMA resposta da RPC em vez de uma por chave de conversa.
  const { data: profiles = [], isLoading } = useTeamProfiles(!!currentProfileId);

  // Uma chave so para os aniversarios: a RPC devolve a equipe inteira e nao se repete
  // a cada troca de conversa (staleTime de alguns minutos).
  const { data: birthdays = SEM_ANIVERSARIOS } = useQuery({
    queryKey: queryKeys.teamBirthdays(),
    queryFn: rpcTeamBirthdays,
    enabled: !!currentProfileId,
    staleTime: 5 * 60_000,
  });

  const team = useMemo(
    () => profiles.map((row) => toMemberProfile(row, birthdays)),
    [profiles, birthdays],
  );

  const memberProfile = useMemo(() => {
    if (conversation.type !== 'direct' || !otherMemberId) return null;
    return team.find((m) => m.id === otherMemberId) ?? null;
  }, [team, conversation.type, otherMemberId]);

  const groupMembers = useMemo(() => {
    if (conversation.type !== 'group') return [];
    const wanted = new Set(memberIds);
    return team.filter((m) => wanted.has(m.id));
  }, [team, conversation.type, memberIds]);

  return { memberProfile, isLoading, groupMembers };
}
