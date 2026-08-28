import type { Database } from '@/integrations/supabase/types';

export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type MessageInsert = Database['public']['Tables']['messages']['Insert'];
export type MessageUpdate = Database['public']['Tables']['messages']['Update'];

export interface MessageReaction {
  id: string;
  emoji: string;
  userId: string;
  userName?: string;
  createdAt?: string;
}

export interface Message extends Partial<Omit<MessageRow, 'id' | 'content' | 'sender'>> {
  id: string;
  content: string;
  created_at?: string;
  sender: 'agent' | 'contact';
  senderName?: string;
  timestamp: Date;
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'document' | 'location' | 'interactive' | 'sticker';
  mediaUrl?: string;
  isEdited?: boolean;
  replyTo?: { messageId: string; content: string; sender: 'agent' | 'contact'; type?: string } | null;
  buttonResponse?: { buttonId: string; buttonTitle: string; title?: string } | null;
  interactive?: InteractiveMessage | null;
  location?: LocationMessage | null;
  transcriptionStatus?: string | null;
  reactions?: MessageReaction[];
  conversationId?: string;
}


export interface ConversationContact {
  id: string;
  name: string;
  surname?: string | null;
  nickname?: string | null;
  phone: string;
  email?: string | null;
  avatar_url?: string | null;
  avatar?: string | null;
  tags?: string[] | null;
  company?: string | null;
  job_title?: string | null;
  assigned_to?: string | null;
  queue_id?: string | null;
  created_at?: string;
  createdAt?: Date;
  updated_at?: string;
  whatsapp_connection_id?: string | null;
  contact_type?: string | null;
  group_category?: string | null;
  ai_sentiment?: string | null;
}

export interface AssignedAgentInfo {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface Conversation {
  id: string;
  contact: ConversationContact;
  lastMessage?: any;
  unreadCount: number;
  status: 'open' | 'closed' | 'pending' | 'waiting' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  assignedTo?: AssignedAgentInfo | null;
  queue?: { id: string; name: string; color?: string } | null;
  sentiment?: string | null;
  sentimentScore?: number | null;
}

export interface InteractiveMessage {
  type: 'button' | 'buttons' | 'list';
  header?: { type: 'text' | 'image' | 'video'; text?: string; media_url?: string; mediaUrl?: string };
  body: string;
  footer?: string;
  buttons?: InteractiveButton[];
  sections?: InteractiveListSection[];
  listButtonText?: string;
}

export interface InteractiveButton {
  id: string;
  text?: string;
  title?: string;
  type?: 'reply' | 'url' | 'call' | 'phone';
  url?: string;
  phoneNumber?: string;
}

export interface InteractiveListSection {
  title: string;
  rows: { id: string; title: string; description?: string }[];
}

export interface LocationMessage {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  isLive?: boolean;
  liveUntil?: string | Date;
}
