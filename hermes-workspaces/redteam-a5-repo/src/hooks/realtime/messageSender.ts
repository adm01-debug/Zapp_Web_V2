import { getLogger } from '@/lib/logger';
import {
  sendOutboundMessage,
  type OutboundMessageType,
} from '@/services/outbound-message.service';

const log = getLogger('MessageSender');

interface SendMessageResult {
  id: string;
  contact_id: string | null;
  content: string;
  [key: string]: unknown;
}

const OUTBOUND_MESSAGE_TYPES = new Set<OutboundMessageType>([
  'text', 'image', 'audio', 'video', 'document', 'sticker', 'location',
]);

/** Compatibility facade for the realtime inbox's existing call sites. */
export async function sendMessageToContact(
  contactId: string,
  content: string,
  messageType = 'text',
  mediaUrl?: string,
  mediaPayload?: string
): Promise<SendMessageResult> {
  if (!OUTBOUND_MESSAGE_TYPES.has(messageType as OutboundMessageType)) {
    throw new Error(`Tipo de mensagem não suportado pelo envio seguro: ${messageType}`);
  }
  if (mediaPayload && !mediaUrl) {
    throw new Error('Envie a mídia ao armazenamento antes de despachá-la.');
  }
  try {
    const result = await sendOutboundMessage({
      contactId,
      content,
      messageType: messageType as OutboundMessageType,
      mediaUrl: mediaUrl ?? null,
    });
    return {
      id: result.id,
      contact_id: contactId,
      content,
      status: result.status,
      external_id: result.externalId,
    };
  } catch (error) {
    log.error('Error sending through atomic delivery:', error);
    throw error;
  }
}
