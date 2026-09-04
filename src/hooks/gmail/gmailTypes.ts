export interface GmailAccount {
  id: string;
  email_address: string;
  is_active: boolean;
  sync_status: 'pending' | 'syncing' | 'synced' | 'error';
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface EmailThread {
  id: string;
  gmail_account_id: string;
  gmail_thread_id: string;
  contact_id: string | null;
  subject: string;
  snippet: string;
  label_ids: string[];
  message_count: number;
  is_unread: boolean;
  is_starred: boolean;
  is_important: boolean;
  last_message_at: string;
  assigned_to: string | null;
  status: 'open' | 'pending' | 'resolved' | 'archived';
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  created_at: string;
  updated_at: string;
  contact?: { id: string; name: string; email: string; avatar_url: string | null };
}

export interface EmailMessage {
  id: string;
  thread_id: string;
  gmail_message_id: string;
  gmail_account_id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  bcc_addresses: string[];
  reply_to_address: string | null;
  subject: string;
  body_text: string;
  body_html: string;
  snippet: string;
  label_ids: string[];
  is_read: boolean;
  is_starred: boolean;
  has_attachments: boolean;
  in_reply_to: string | null;
  references_header: string | null;
  internal_date: string;
  direction: 'inbound' | 'outbound';
  created_at: string;
}

export interface EmailAttachment {
  id: string;
  email_message_id: string;
  gmail_attachment_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string | null;
}

export interface EmailLabel {
  id: string;
  gmail_label_id: string;
  name: string;
  label_type: 'system' | 'user';
  color: string | null;
  message_count: number;
  unread_count: number;
}
