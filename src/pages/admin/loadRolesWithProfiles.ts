/**
 * R2-AUTH-033: carregador de roles + perfis.
 *
 * `user_roles.user_id` referencia `auth.users`, não `profiles`. Por isso o
 * embed `profiles!user_roles_user_id_fkey` NÃO existe no PostgREST (o tipo
 * gerado de `user_roles` declara `Relationships: []`) e a consulta antiga
 * falhava. Aqui as duas tabelas são lidas separadamente e unidas no cliente
 * por `user_id`.
 *
 * Erro de qualquer uma das consultas é PROPAGADO (throw), nunca convertido em
 * lista vazia: lista vazia significa "não há papéis", não "a consulta falhou".
 */
// `src/pages/**` não importa o client do Supabase direto (regra no-restricted-imports);
// `@/lib/supabaseHelpers` é o re-export permitido do mesmo client.
import { supabase } from '@/lib/supabaseHelpers';

export type RoleType = 'admin' | 'supervisor' | 'agent' | 'special_agent';

export interface ProfileSummary {
  name: string;
  email: string | null;
  avatar_url: string | null;
}

export interface RoleWithProfile {
  id: string;
  user_id: string;
  role: RoleType;
  profile?: ProfileSummary;
}

interface UserRoleRow {
  id: string;
  user_id: string;
  role: RoleType;
}

interface ProfileRow {
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
}

export async function loadRolesWithProfiles(): Promise<RoleWithProfile[]> {
  const { data: roleRows, error: rolesError } = await supabase
    .from('user_roles')
    .select('id, user_id, role')
    .order('role');

  if (rolesError) throw rolesError;

  const roles = (roleRows ?? []) as unknown as UserRoleRow[];
  if (roles.length === 0) return [];

  const userIds = Array.from(new Set(roles.map((row) => row.user_id)));

  const { data: profileRows, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, name, email, avatar_url')
    .in('user_id', userIds);

  if (profilesError) throw profilesError;

  const profilesByUserId = new Map<string, ProfileSummary>();
  for (const profile of (profileRows ?? []) as unknown as ProfileRow[]) {
    profilesByUserId.set(profile.user_id, {
      name: profile.name,
      email: profile.email,
      avatar_url: profile.avatar_url,
    });
  }

  return roles.map((role) => ({
    id: role.id,
    user_id: role.user_id,
    role: role.role,
    profile: profilesByUserId.get(role.user_id),
  }));
}
