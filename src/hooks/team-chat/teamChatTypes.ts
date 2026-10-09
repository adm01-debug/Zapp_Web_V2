import type { Database } from '@/integrations/supabase/types';

/**
 * SL-081 (F51) — os tipos do Team Chat saem de `types.ts` (schema regenerado),
 * não de cópia à mão. A linha da tabela e o retorno da RPC são a mesma coisa que
 * o banco entrega; escrever de novo aqui é como o tipo e o banco divergem sem
 * ninguém ver.
 */
type Tables = Database['public']['Tables'];
type Functions = Database['public']['Functions'];

export type TeamConversationRow = Tables['team_conversations']['Row'];
export type TeamConversationMemberRow = Tables['team_conversation_members']['Row'];
export type TeamMessageRow = Tables['team_messages']['Row'];
export type TeamMessageReactionRow = Tables['team_message_reactions']['Row'];

/** Retorno de `get_team_inbox` (o front consome a linha direto, sem remontar). */
export type TeamInboxRow = Functions['get_team_inbox']['Returns'][number];
/** Retorno de `get_team_messages_page` (página do histórico por cursor). */
export type TeamMessagePageRow = Functions['get_team_messages_page']['Returns'][number];

/**
 * Vocabulário do CHECK `team_conversations_type_check`: é o que o banco aceita.
 * A tela de Team Chat hoje só desenha `direct` e `group`, então
 * `TeamConversation.type` continua com esses dois — conversa de departamento
 * entra quando a tela tratar dela.
 */
export type TeamConversationType = 'direct' | 'group' | 'department';
/** Mesmo vocabulário do CHECK `team_conversation_members_member_role_check`. */
export type TeamMemberRole = 'owner' | 'admin' | 'member';

/**
 * Verbos aceitos pelo CHECK `department_audit_logs_action_check`. É lista de
 * runtime (e não só tipo) para o teste do README poder comparar com a migration.
 */
export const DEPARTMENT_AUDIT_ACTIONS = [
  'accept_invite',
  'create_invite',
  'join_department',
  'leave_department',
  'remove_member',
  'update_settings',
  'delete_department',
  'create_department',
  'update_role',
  'kick_member',
  'create_group',
  'delete_group',
  'whatsapp_updated',
] as const;

export type DepartmentAuditAction = (typeof DEPARTMENT_AUDIT_ACTIONS)[number];

export interface TeamConversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  department_id?: string | null;
  members?: TeamMember[];
  last_message?: TeamMessage | null;
  unread_count?: number;
}

export interface TeamMember {
  id: string;
  conversation_id: string;
  profile_id: string;
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  member_role?: TeamMemberRole;
  profile?: {
    id: string;
    name: string;
    email: string | null;
    avatar_url: string | null;
    is_active: boolean;
  };
}

export interface TeamMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  media_url: string | null;
  media_type: string | null;
  media_bucket?: string | null;
  media_path?: string | null;
  reply_to_id: string | null;
  is_edited: boolean;
  status?: string | null;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  reply_to?: TeamMessage | null;
}
