import { supabase } from '@/integrations/supabase/client';

export type OutboundMessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location';

export interface SendOutboundMessageInput {
  contactId: string;
  content: string;
  messageType?: OutboundMessageType;
  mediaUrl?: string | null;
  replyToId?: string | null;
  whatsappConnectionId?: string | null;
  /**
   * A stable id makes a repeated browser submission idempotent.  Callers that
   * do not have one get a new UUID for this user action.
   */
  clientMessageId?: string;
}

export interface OutboundMessageDeliveryResult {
  id: string;
  status: string | null;
  externalId: string | null;
  idempotent: boolean;
}

export interface RichOutboundMessageInput {
  contactId: string;
  displayContent: string;
  messageType: 'poll' | 'contact';
  deliveryPayload: Record<string, unknown>;
  replyToId?: string | null;
  whatsappConnectionId?: string | null;
  clientMessageId?: string;
}

interface DeliveryResponse {
  messageId?: unknown;
  status?: unknown;
  externalId?: unknown;
  idempotent?: unknown;
  error?: unknown;
}

function createClientMessageId(): string {
  if (typeof crypto?.randomUUID !== 'function') {
    throw new Error('Seu navegador não suporta identificadores de entrega seguros. Atualize-o e tente novamente.');
  }
  return crypto.randomUUID();
}

/**
 * Canonical browser entrypoint for outbound WhatsApp traffic.
 *
 * The browser may enqueue an authorized message, but never owns its delivery
 * lease or status transition.  The Edge Function claims it with service-role
 * credentials and the database fences completion by claim token.
 */
export async function sendOutboundMessage(
  input: SendOutboundMessageInput,
): Promise<OutboundMessageDeliveryResult> {
  const clientMessageId = input.clientMessageId ?? createClientMessageId();
  const { data: queued, error: enqueueError } = await supabase.rpc('enqueue_outbound_message', {
    p_contact_id: input.contactId,
    p_client_message_id: clientMessageId,
    p_content: input.content,
    p_message_type: input.messageType ?? 'text',
    p_media_url: input.mediaUrl ?? undefined,
    p_reply_to_id: input.replyToId ?? undefined,
    p_whatsapp_connection_id: input.whatsappConnectionId ?? undefined,
  });

  if (enqueueError || !queued?.id) {
    throw enqueueError ?? new Error('Não foi possível enfileirar a mensagem.');
  }

  return dispatchQueuedMessage(queued.id, queued.status, queued.external_id);
}

async function dispatchQueuedMessage(
  messageId: string,
  queuedStatus: string | null,
  queuedExternalId: string | null,
): Promise<OutboundMessageDeliveryResult> {
  const { data: deliveryData, error: deliveryError } = await supabase.functions.invoke('message-delivery', {
    body: { messageId },
  });
  if (deliveryError) throw deliveryError;

  const delivery = (deliveryData ?? {}) as DeliveryResponse;
  if (typeof delivery.error === 'string' && delivery.error) {
    throw new Error(delivery.error);
  }
  if (typeof delivery.messageId !== 'string' || delivery.messageId !== messageId) {
    throw new Error('Resposta inválida do serviço de entrega.');
  }

  return {
    id: messageId,
    status: typeof delivery.status === 'string' ? delivery.status : queuedStatus,
    externalId: typeof delivery.externalId === 'string' ? delivery.externalId : queuedExternalId,
    idempotent: delivery.idempotent === true,
  };
}

/** Queue an outbound poll or contact card with an immutable transport payload. */
export async function sendRichOutboundMessage(
  input: RichOutboundMessageInput,
): Promise<OutboundMessageDeliveryResult> {
  const rpcClient = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => Promise<{
      data: { id?: string; status?: string | null; external_id?: string | null } | null;
      error: Error | null;
    }>;
  };
  const { data: queued, error: enqueueError } = await rpcClient.rpc('enqueue_rich_outbound_message', {
    p_contact_id: input.contactId,
    p_client_message_id: input.clientMessageId ?? createClientMessageId(),
    p_display_content: input.displayContent,
    p_message_type: input.messageType,
    p_delivery_payload: input.deliveryPayload,
    p_reply_to_id: input.replyToId ?? undefined,
    p_whatsapp_connection_id: input.whatsappConnectionId ?? undefined,
  });
  if (enqueueError || !queued?.id) {
    throw enqueueError ?? new Error('Não foi possível enfileirar a mensagem estruturada.');
  }
  return dispatchQueuedMessage(queued.id, queued.status ?? null, queued.external_id ?? null);
}
