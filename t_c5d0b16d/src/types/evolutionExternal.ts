/**
 * Types for evolution_* tables in the external FATOR X database
 */

// ─── evolution_messages ───────────────────────────────────────
export interface EvolutionMessage {
  id: string;
  message_id: string;
  remote_jid: string;
  from_me: boolean;
  message_type: string;
  content: string | null;
  media_url: string | null;
  media_mimetype: string | null;
  media_type: string | null;
  media_filename: string | null;
  media_size: number | null;
  caption: string | null;
  quoted_message_id: string | null;
  is_starred: boolean;
  is_important: boolean;
  category: string | null;
  sentiment: string | null;
  tags: string[] | null;
  notes: string | null;
  follow_up_at: string | null;
  follow_up_done: boolean;
  payload: Record<string, unknown> | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  contact_id: string | null;
  conversation_id: string | null;
  direction: string;
  status: string;
  status_at: string | null;
  sent_by_bot: boolean;
  template_name: string | null;
  instance_name: string;
  push_name: string | null;
  deleted_at: string | null;
}

// ─── evolution_webhook_events ─────────────────────────────────
export interface EvolutionWebhookEvent {
  id: string;
  event_type: string;
  instance_name: string;
  remote_jid: string | null;
  from_me: boolean;
  message_type: string;
  push_name: string | null;
  payload: Record<string, unknown> | unknown[];
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// ─── evolution_settings ───────────────────────────────────────
export interface EvolutionSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
}

// ─── evolution_contacts ───────────────────────────────────────
export interface EvolutionContact {
  id: string;
  remote_jid: string;
  push_name: string | null;
  profile_picture_url: string | null;
  instance_name: string;
  is_group: boolean;
  created_at: string;
  updated_at: string;
}

// ─── evolution_conversations ──────────────────────────────────
export interface EvolutionConversation {
  id: string;
  remote_jid: string;
  contact_id: string | null;
  instance_name: string;
  status: string;
  assigned_to: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Derived contact from messages (since evolution_contacts is empty) ──
export interface DerivedContact {
  remoteJid: string;
  pushName: string | null;
  phone: string;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  lastMessageContent: string | null;
  lastMessageDirection: string;
  instanceName: string;
}
