import { Message, Conversation, ConversationContact, MessageRow } from '@/types/chat';
import { RealtimeMessage, ConversationWithMessages, ConversationContact as RealtimeContact } from '@/hooks/chat/useRealtimeMessages';

export function mapMessageRowToMessage(row: MessageRow): Message {
  return {
    ...row,
    id: row.id,
    content: row.content,
    sender: (row.sender as 'agent' | 'contact'),
    timestamp: new Date(row.created_at),
    type: row.message_type as Message['type'],
    mediaUrl: row.media_url || undefined,
    isEdited: !!(row as { is_edited?: boolean }).is_edited,
    is_deleted: row.is_deleted ?? false,
    external_id: row.external_id || undefined,
  };
}

export function mapRealtimeContactToContact(rc: RealtimeContact): ConversationContact {
  return {
    ...rc,
    avatar: rc.avatar_url || undefined,
    createdAt: new Date(rc.created_at),
    tags: rc.tags || [],
  };
}

export function mapRealtimeMessageToMessage(rm: RealtimeMessage, conversationId?: string): Message {
  return {
    ...rm,
    id: rm.id,
    conversationId: conversationId || rm.contact_id || '',
    content: rm.content,
    type: rm.message_type as Message['type'],
    sender: rm.sender as Message['sender'],
    timestamp: new Date(rm.created_at),
    status: (rm.status as Message['status'] | null) || (rm.is_read ? 'read' : 'delivered'),
    mediaUrl: rm.media_url || undefined,
    transcription: rm.transcription || null,
    transcriptionStatus: (rm.transcription_status as Message['transcriptionStatus']) || null,
    is_deleted: rm.is_deleted ?? false,
    external_id: rm.external_id || undefined,
    created_at: rm.created_at,
  };
}

export function mapRealtimeConversationToConversation(rc: ConversationWithMessages): Conversation {
  // SLA de 1a resposta: prioridade para o canônico do banco (conversation_sla),
  // que existe mesmo quando a janela de mensagens veio vazia; fallback no
  // derivado da primeira mensagem do atendente efetivamente enviada.
  const slaEmbed = (rc.contact as RealtimeContact & {
    conversation_sla?: { first_response_at: string | null } | null;
  }).conversation_sla;

  const firstAgentMessage = rc.messages
    .filter(m => m.sender === 'agent' && m.status !== 'failed' && m.status !== 'sending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

  return {
    id: rc.contact.id,
    contact: mapRealtimeContactToContact(rc.contact),
    lastMessage: rc.lastMessage ? mapRealtimeMessageToMessage(rc.lastMessage, rc.contact.id) : undefined,
    unreadCount: rc.unreadCount,
    status: 'open',
    priority: (rc.contact.ai_sentiment === 'negative' ? 'high' : 'medium') as Conversation['priority'],
    tags: rc.contact.tags || [],
    createdAt: new Date(rc.contact.created_at),
    updatedAt: new Date(rc.contact.updated_at),
    firstResponseAt: slaEmbed?.first_response_at
      ? new Date(slaEmbed.first_response_at)
      : firstAgentMessage ? new Date(firstAgentMessage.created_at) : null,
    assignedTo: rc.contact.assigned_to ? { id: rc.contact.assigned_to, name: 'Atendente' } : null,
    sentiment: rc.contact.ai_sentiment,
  };
}

