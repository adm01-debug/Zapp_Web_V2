/**
 * Adapters to convert evolution_messages from external DB
 * into the frontend's Message and Conversation types
 */
import type { EvolutionMessage, DerivedContact } from '@/types/evolutionExternal';
import type { RealtimeMessage, ConversationContact, ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

/**
 * Extract phone number from remote_jid (e.g. "5511999990001@s.whatsapp.net" → "5511999990001")
 */
export function jidToPhone(jid: string): string {
  return jid.replace(/@.*$/, '');
}

/**
 * Convert an EvolutionMessage into the frontend's RealtimeMessage shape
 */
export function evolutionToRealtimeMessage(evo: EvolutionMessage): RealtimeMessage {
  return {
    id: evo.id,
    contact_id: evo.contact_id || evo.remote_jid, // use remote_jid as fallback ID
    agent_id: evo.from_me ? 'system' : null,
    content: evo.content || evo.caption || '',
    sender: evo.from_me || evo.direction === 'outbound' ? 'agent' : 'contact',
    message_type: mapMessageType(evo.message_type),
    media_url: evo.media_url,
    is_read: evo.status === 'read',
    status: mapStatus(evo.status),
    status_updated_at: evo.status_at,
    created_at: evo.created_at,
    updated_at: evo.created_at,
    external_id: evo.message_id,
    whatsapp_connection_id: null,
    channel_connection_id: null,
    channel_type: 'whatsapp',
    is_edited: false,
    transcription: null,
    transcription_status: null,
    is_deleted: evo.deleted_at != null,
    audio_meme_id: null,
    caption: evo.caption ?? null,
    link_preview: null,
    media_filename: null,
    media_mimetype: null,
    media_size: null,
    media_type: null,
    media_meta: null,
    ptt: null,
    reply_to_id: null,
  };
}

function mapMessageType(evoType: string): string {
  const mapping: Record<string, string> = {
    conversation: 'text',
    extendedTextMessage: 'text',
    imageMessage: 'image',
    videoMessage: 'video',
    audioMessage: 'audio',
    documentMessage: 'document',
    stickerMessage: 'sticker',
    locationMessage: 'location',
    contactMessage: 'text',
    text: 'text',
    image: 'image',
    video: 'video',
    audio: 'audio',
    document: 'document',
  };
  return mapping[evoType] || 'text';
}

function mapStatus(evoStatus: string): 'sent' | 'delivered' | 'read' | 'failed' | null {
  const mapping: Record<string, 'sent' | 'delivered' | 'read' | 'failed'> = {
    sent: 'sent',
    delivered: 'delivered',
    read: 'read',
    received: 'delivered',
    played: 'read',
    failed: 'failed',
    error: 'failed',
  };
  return mapping[evoStatus] || 'sent';
}

/**
 * Derive unique contacts from a list of evolution messages
 */
export function deriveContactsFromMessages(messages: EvolutionMessage[]): DerivedContact[] {
  const contactMap = new Map<string, DerivedContact>();

  for (const msg of messages) {
    if (!msg.remote_jid) continue;

    const existing = contactMap.get(msg.remote_jid);
    const isUnread = !msg.from_me && msg.status !== 'read';

    if (!existing) {
      contactMap.set(msg.remote_jid, {
        remoteJid: msg.remote_jid,
        pushName: msg.push_name,
        phone: jidToPhone(msg.remote_jid),
        lastMessageAt: msg.created_at,
        messageCount: 1,
        unreadCount: isUnread ? 1 : 0,
        lastMessageContent: msg.content || msg.caption,
        lastMessageDirection: msg.direction,
        instanceName: msg.instance_name,
      });
    } else {
      existing.messageCount++;
      if (isUnread) existing.unreadCount++;
      if (!existing.pushName && msg.push_name) existing.pushName = msg.push_name;
      if (new Date(msg.created_at) > new Date(existing.lastMessageAt)) {
        existing.lastMessageAt = msg.created_at;
        existing.lastMessageContent = msg.content || msg.caption;
        existing.lastMessageDirection = msg.direction;
      }
    }
  }

  return Array.from(contactMap.values()).sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
}

/**
 * Convert a DerivedContact into the frontend's ConversationContact shape
 */
export function derivedToConversationContact(dc: DerivedContact): ConversationContact {
  return {
    id: dc.remoteJid, // Use jid as ID since evolution_contacts is empty
    name: dc.pushName || dc.phone,
    surname: null,
    nickname: dc.pushName,
    phone: dc.phone,
    email: null,
    avatar_url: null,
    tags: null,
    company: null,
    job_title: null,
    assigned_to: null,
    queue_id: null,
    created_at: dc.lastMessageAt,
    updated_at: dc.lastMessageAt,
    whatsapp_connection_id: null,
    channel_connection_id: null,
    channel_type: 'whatsapp',
    contact_type: 'whatsapp',
    group_category: null,
    ai_sentiment: null,
    ai_priority: 'medium',
    consent_status: 'opt_in',
    lead_origin: null,
    lead_score: 0,
    notes: null,
    risk_score: 0,
  };
}

/**
 * Build ConversationWithMessages from evolution messages grouped by remote_jid
 */
export function buildExternalConversations(messages: EvolutionMessage[]): ConversationWithMessages[] {
  const derivedContacts = deriveContactsFromMessages(messages);
  const messagesByJid = new Map<string, EvolutionMessage[]>();

  for (const msg of messages) {
    if (!msg.remote_jid) continue;
    const existing = messagesByJid.get(msg.remote_jid) || [];
    existing.push(msg);
    messagesByJid.set(msg.remote_jid, existing);
  }

  return derivedContacts.map((dc) => {
    const contact = derivedToConversationContact(dc);
    const evoMessages = messagesByJid.get(dc.remoteJid) || [];
    const realtimeMessages = evoMessages
      .map(evolutionToRealtimeMessage)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    const unreadCount = realtimeMessages.filter(m => !m.is_read && m.sender === 'contact').length;
    const lastMessage = realtimeMessages.length > 0 ? realtimeMessages[realtimeMessages.length - 1] : null;

    return { contact, messages: realtimeMessages, unreadCount, lastMessage };
  });
}
