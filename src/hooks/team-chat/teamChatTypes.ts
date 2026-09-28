export interface TeamConversation {
  id: string;
  type: 'direct' | 'group' | 'department' | 'announcement';
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  department_id?: string | null;
  // per-member fields (calling user's membership row)
  member_role?: 'admin' | 'member' | 'viewer';
  is_pinned?: boolean;
  is_archived?: boolean;
  is_muted?: boolean;
  last_read_at?: string | null;
  // enriched fields
  members?: TeamMember[];
  last_message?: TeamMessage | null;
  unread_count?: number;
}

export interface TeamConversationInbox {
  conversation_id: string;
  type: 'direct' | 'group' | 'department' | 'announcement';
  name: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  department_id: string | null;
  member_role: 'admin' | 'member' | 'viewer';
  is_pinned: boolean;
  is_archived: boolean;
  is_muted: boolean;
  last_read_at: string | null;
  last_message_id: string | null;
  last_message_content: string | null;
  last_message_type: string | null;
  last_message_sender_id: string | null;
  last_message_created_at: string | null;
  unread_count: number;
  members: Array<{
    profile_id: string;
    role: string;
    display_name: string | null;
    avatar_url: string | null;
  }>;
}

export interface TeamMessagePage {
  messages: TeamMessage[];
  nextCursor: string | null;
}

export interface TeamMember {
  id: string;
  conversation_id: string;
  profile_id: string;
  joined_at: string;
  last_read_at: string | null;
  is_muted: boolean;
  member_role?: 'admin' | 'member' | 'viewer';
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
