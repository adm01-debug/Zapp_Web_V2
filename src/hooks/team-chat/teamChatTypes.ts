// Tipos canônicos do módulo team-chat (E56)
export type ConversationType = 'direct' | 'group' | 'department';
export type MemberRole = 'owner' | 'admin' | 'member';
export type MessageUIStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'error';

export interface TeamMember {
  profile_id: string;
  conversation_id: string;
  role: MemberRole;
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  profile?: {
    id: string;
    name: string;
    email: string;
    avatar_url: string | null;
    is_active: boolean;
  } | null;
  // alias para compatibilidade legada
  member_role?: MemberRole;
}

export interface TeamMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  status: MessageUIStatus | null;
  media_url: string | null;
  media_type: string | null;
  media_bucket: string | null;
  media_path: string | null;
  reply_to_id: string | null;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
  // campos extras da RPC get_team_messages_page
  sender_name?: string;
  sender_avatar_url?: string | null;
}

export interface TeamConversation {
  id: string;
  type: ConversationType;
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  department_id: string | null;
  created_at: string;
  updated_at: string;
  members: TeamMember[];
  last_message: TeamMessage | null;
  unread_count: number;
}

// Linha retornada pela RPC get_team_inbox
export interface TeamInboxRow {
  conversation_id: string;
  name: string | null;
  type: string;
  avatar_url: string | null;
  member_role: MemberRole;
  created_at: string;
  unread_count: number;
  last_message_id: string | null;
  last_message_content: string | null;
  last_message_type: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: string | null;
}

// Linha retornada pela RPC get_team_messages_page
export interface TeamMessagePageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  status: string | null;
  media_url: string | null;
  media_type: string | null;
  media_bucket: string | null;
  media_path: string | null;
  reply_to_id: string | null;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  sender_name: string;
  sender_avatar_url: string | null;
}
