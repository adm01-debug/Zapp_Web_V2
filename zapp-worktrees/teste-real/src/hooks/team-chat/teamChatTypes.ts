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
