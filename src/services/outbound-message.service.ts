import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/invokeEdge';
import { crossTabSendDedupe } from '@/lib/crossTabSendDedupe';
import { drainOfflineQueueOnReconnect, offlineSendQueue, type OfflineQueuedMessage } from '@/lib/offlineQueue';
import { sendThrottle } from '@/lib/sendThrottle';

export type OutboundMessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location';

export interface SendOutboundMessageInput {
  contactId: string;
  content: string;
  messageType?: OutboundMessageType;
  mediaUrl?: string | null;
  caption?: string | null;
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
  messageType: 'poll' | 'contact' | 'buttons' | 'list';
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

interface QueuedMessage {
  id?: string;
  status?: string | null;
  external_id?: string | null;
}

interface AtomicQueueRpc {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: QueuedMessage | null;
    error: Error | null;
  }>;
}

// A dispatch response can be lost after the row is committed. Keep the
// idempotency key for that exact browser action so a user retry cannot create
// a second WhatsApp send. It is deliberately memory-only: a fresh deliberate
// composition after a reload remains a new action.
const pendingActionIds = new Map<string, string>();

function createClientMessageId(): string {
  if (typeof crypto?.randomUUID !== 'function') {
    throw new Error('Seu navegador não suporta identificadores de entrega seguros. Atualize-o e tente novamente.');
  }
  return crypto.randomUUID();
}

function actionKey(input: SendOutboundMessageInput | RichOutboundMessageInput): string {
  const rich = 'displayContent' in input;
  return JSON.stringify([
    input.contactId,
    input.messageType,
    rich ? input.displayContent : input.content,
    rich ? input.deliveryPayload : input.mediaUrl ?? null,
    input.replyToId ?? null,
    input.whatsappConnectionId ?? null,
  ]);
}

function resolveClientMessageId(input: SendOutboundMessageInput | RichOutboundMessageInput) {
  if (input.clientMessageId) return { id: input.clientMessageId, key: null };
  const key = actionKey(input);
  const id = pendingActionIds.get(key) ?? createClientMessageId();
  pendingActionIds.set(key, id);
  return { id, key };
}

function clearPendingAction(key: string | null, id: string) {
  if (key && pendingActionIds.get(key) === id) pendingActionIds.delete(key);
}

/** Sem rede não há como enfileirar no servidor: a mensagem espera na fila local (item 025). */
function semRede(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function enqueueAndDispatch(
  input: SendOutboundMessageInput,
  clientMessageId: string,
): Promise<OutboundMessageDeliveryResult> {
  // Generated database types intentionally stay bound to the canonical
  // database until the controlled migration is applied. This narrow transport
  // shape is removed by the post-deploy type-sync workflow.
  const rpcClient = supabase as unknown as AtomicQueueRpc;
  const { data: queued, error: enqueueError } = await rpcClient.rpc('enqueue_outbound_message', {
    p_contact_id: input.contactId,
    p_client_message_id: clientMessageId,
    p_content: input.content,
    p_message_type: input.messageType ?? 'text',
    p_media_url: input.mediaUrl ?? undefined,
    p_reply_to_id: input.replyToId ?? undefined,
    p_whatsapp_connection_id: input.whatsappConnectionId ?? undefined,
    p_caption: input.caption ?? undefined,
  });

  if (enqueueError || !queued?.id) {
    throw enqueueError ?? new Error('Não foi possível enfileirar a mensagem.');
  }

  return dispatchQueuedMessage(queued.id, queued.status ?? null, queued.external_id ?? null);
}

/** O que ficou na fila offline sai com a MESMA chave estável: sem duplicar (item 024). */
async function deliverQueuedOfflineMessage(message: OfflineQueuedMessage): Promise<void> {
  // A drenagem obedece ao MESMO throttle do envio online: a volta da rede não
  // pode virar rajada de requests contra o servidor (item 026).
  await sendThrottle.wait();
  await enqueueAndDispatch(
    {
      contactId: message.contactId,
      content: message.content,
      messageType: message.messageType as OutboundMessageType,
      mediaUrl: message.mediaUrl,
      caption: message.caption,
      replyToId: message.replyToId,
      whatsappConnectionId: message.whatsappConnectionId,
    },
    message.clientMessageId,
  );
}

// Reconciliação ao reconectar (item 025): a fila local drena no evento `online`.
drainOfflineQueueOnReconnect(offlineSendQueue, deliverQueuedOfflineMessage, {
  onError: (error, message) => {
    // A mensagem continua na fila e a próxima reconexão tenta de novo; o aviso é
    // o que impede a espera virar falha silenciosa. `console.warn` (e não o
    // logger do app) mantém este módulo — caminho quente de todo envio — sem
    // dependência nova de import.
    console.warn('Fila offline: entrega adiada', {
      clientMessageId: message?.clientMessageId ?? null,
      erro: error instanceof Error ? error.message : String(error),
    });
  },
});

async function enqueueOffline(
  input: SendOutboundMessageInput,
  clientMessageId: string,
): Promise<OutboundMessageDeliveryResult> {
  const queued = await offlineSendQueue.enqueue({
    clientMessageId,
    contactId: input.contactId,
    content: input.content,
    messageType: input.messageType ?? 'text',
    mediaUrl: input.mediaUrl ?? null,
    caption: input.caption ?? null,
    replyToId: input.replyToId ?? null,
    whatsappConnectionId: input.whatsappConnectionId ?? null,
  });
  // `pending`: a bolha mostra "enviando" até a fila drenar — nada foi entregue ainda.
  return { id: queued.clientMessageId, status: 'pending', externalId: null, idempotent: false };
}

/**
 * Canonical browser entrypoint for outbound WhatsApp traffic.
 *
 * The browser may enqueue an authorized message, but never owns its delivery
 * lease or status transition.  The Edge Function claims it with service-role
 * credentials and the database fences completion by claim token.
 *
 * Dois envios iguais na mesma ação, feitos em abas diferentes, viram UM request
 * (item 026); uma rajada é espaçada por `useSendThrottle` (500 ms / 5 por 3 s);
 * e com a rede caída a mensagem espera na fila local em vez de se perder (025).
 */
export async function sendOutboundMessage(
  input: SendOutboundMessageInput,
): Promise<OutboundMessageDeliveryResult> {
  const { id: clientMessageId, key } = resolveClientMessageId(input);

  if (semRede()) return enqueueOffline(input, clientMessageId);

  const dedupeKey = actionKey(input);
  const claim = await crossTabSendDedupe.claim(dedupeKey, clientMessageId);
  if (!claim.owner) {
    // Outra aba já está mandando esta mesma ação: daqui não sai request nenhum.
    // A chave é a mesma, então as duas abas mostram a MESMA mensagem.
    return { id: claim.clientMessageId, status: 'pending', externalId: null, idempotent: true };
  }

  try {
    await sendThrottle.wait();
    const result = await enqueueAndDispatch(input, clientMessageId);
    clearPendingAction(key, clientMessageId);
    return result;
  } finally {
    // A reivindicação sai até quando o envio falha: sem isso a aba fica "dona"
    // da ação e uma tentativa deliberada igual em outra aba nunca mandaria.
    crossTabSendDedupe.release(dedupeKey);
  }
}

async function dispatchQueuedMessage(
  messageId: string,
  queuedStatus: string | null,
  queuedExternalId: string | null,
): Promise<OutboundMessageDeliveryResult> {
  const { data: deliveryData, error: deliveryError } = await invokeEdge('message-delivery', {
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

/** Queue an outbound poll, contact card or interactive message (buttons/list) with an immutable transport payload. */
export async function sendRichOutboundMessage(
  input: RichOutboundMessageInput,
): Promise<OutboundMessageDeliveryResult> {
  const { id: clientMessageId, key } = resolveClientMessageId(input);
  const rpcClient = supabase as unknown as AtomicQueueRpc;
  const { data: queued, error: enqueueError } = await rpcClient.rpc('enqueue_rich_outbound_message', {
    p_contact_id: input.contactId,
    p_client_message_id: clientMessageId,
    p_display_content: input.displayContent,
    p_message_type: input.messageType,
    p_delivery_payload: input.deliveryPayload,
    p_reply_to_id: input.replyToId ?? undefined,
    p_whatsapp_connection_id: input.whatsappConnectionId ?? undefined,
  });
  if (enqueueError || !queued?.id) {
    throw enqueueError ?? new Error('Não foi possível enfileirar a mensagem estruturada.');
  }
  const result = await dispatchQueuedMessage(queued.id, queued.status ?? null, queued.external_id ?? null);
  clearPendingAction(key, clientMessageId);
  return result;
}
