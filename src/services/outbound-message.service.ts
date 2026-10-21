import { supabase } from '@/integrations/supabase/client';
import { invokeEdge } from '@/lib/invokeEdge';
import { crossTabSendDedupe } from '@/lib/crossTabSendDedupe';
import {
  drainOfflineQueueOnOpen,
  drainOfflineQueueOnReconnect,
  offlineSendQueue,
  type OfflineQueueDrainResult,
  type OfflineQueueErrorHandler,
  type OfflineQueuedMessage,
} from '@/lib/offlineQueue';
import { sendThrottle } from '@/lib/sendThrottle';
import { readAuthenticatedUserId } from '@/lib/mediaVolumeStore';

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
//
// A chave tem vida CURTA: ela cobre a ação enquanto o envio está em voo ou
// quando ele terminou de forma AMBÍGUA/falha (é o que mantém idempotentes o
// duplo clique e o botão "Enviar de novo"). Ela morre ao concluir com sucesso,
// quando a ação vai para a fila offline — a fila guarda o próprio id no item —
// e sozinha depois de `PENDING_ACTION_TTL_MS`. Sem essa morte, o MESMO texto
// enviado mais tarde (ex.: "ok", "bom dia") reaproveitava o id de uma linha já
// entregue, o `enqueue_outbound_message` devolvia a linha existente, a Edge
// respondia `idempotent: true` e NENHUM WhatsApp saía — o chat ainda dizia
// "Mensagem enviada". Uma entrada expirada é descartada na leitura: o módulo
// não agenda timer próprio.
export const PENDING_ACTION_TTL_MS = 2 * 60 * 1000;

interface PendingAction {
  id: string;
  /** Instante (epoch ms) depois do qual a chave não vale mais. */
  expiresAt: number;
}

const pendingActionIds = new Map<string, PendingAction>();

function createClientMessageId(): string {
  if (typeof crypto?.randomUUID !== 'function') {
    throw new Error('Seu navegador não suporta identificadores de entrega seguros. Atualize-o e tente novamente.');
  }
  return crypto.randomUUID();
}

/** Tipo já normalizado: sem tipo explícito a mensagem é texto, igual ao que a fila offline guarda. */
function actionKey(input: SendOutboundMessageInput | RichOutboundMessageInput): string {
  const rich = 'displayContent' in input;
  return JSON.stringify([
    input.contactId,
    input.messageType ?? 'text',
    rich ? input.displayContent : input.content,
    rich ? input.deliveryPayload : input.mediaUrl ?? null,
    input.replyToId ?? null,
    input.whatsappConnectionId ?? null,
  ]);
}

/**
 * Chave da ação de um item que já está na fila offline. O item guarda o tipo
 * normalizado, então a chave reconstruída é idêntica à que `resolveClientMessageId`
 * criou — é o que permite a drenagem limpar a entrada certa ao concluir.
 */
function queuedActionKey(message: OfflineQueuedMessage): string {
  return JSON.stringify([
    message.contactId,
    message.messageType,
    message.content,
    message.mediaUrl ?? null,
    message.replyToId ?? null,
    message.whatsappConnectionId ?? null,
  ]);
}

function resolveClientMessageId(input: SendOutboundMessageInput | RichOutboundMessageInput) {
  if (input.clientMessageId) return { id: input.clientMessageId, key: null };
  const key = actionKey(input);
  const agora = Date.now();
  const pendente = pendingActionIds.get(key);
  if (pendente && pendente.expiresAt > agora) return { id: pendente.id, key };
  const id = createClientMessageId();
  pendingActionIds.set(key, { id, expiresAt: agora + PENDING_ACTION_TTL_MS });
  return { id, key };
}

/** Apaga só quando a chave ainda aponta para o id desta ação: uma ação nova não é limpa por uma antiga. */
function clearPendingAction(key: string | null, id: string) {
  if (key && pendingActionIds.get(key)?.id === id) pendingActionIds.delete(key);
}

type EnqueueResult = { data: QueuedMessage | null; error: Error | null };

/** Entrega em voo de um reenvio após falha definitiva, por chave de ação. */
interface VooReenvio {
  promise: Promise<OutboundMessageDeliveryResult>;
  concluir: (entrega: OutboundMessageDeliveryResult) => void;
  falhar: (erro: unknown) => void;
}

/**
 * Reenvios após falha definitiva em voo, por chave de ação. O duplo clique
 * concorrente depois de uma falha definitiva adota o voo do dono em vez de
 * criar outra linha: um id novo só e um dispatch só.
 */
const reenviosEmVoo = new Map<string, VooReenvio>();

function publicarVooReenvio(key: string): VooReenvio {
  let concluir!: (entrega: OutboundMessageDeliveryResult) => void;
  let falhar!: (erro: unknown) => void;
  const promise = new Promise<OutboundMessageDeliveryResult>((resolver, rejeitar) => {
    concluir = resolver;
    falhar = rejeitar;
  });
  // Sem adotante, um voo rejeitado seria "unhandled": este catch só marca como
  // tratado; cada adotante continua recebendo a rejeição no próprio await.
  promise.catch(() => {});
  const voo: VooReenvio = { promise, concluir, falhar };
  reenviosEmVoo.set(key, voo);
  return voo;
}

type ResultadoEnqueue =
  | { tipo: 'adotado'; voo: Promise<OutboundMessageDeliveryResult>; usedId: string }
  | { tipo: 'enfileirado'; queued: EnqueueResult; usedId: string; voo: VooReenvio | null };

/**
 * Falha definitiva não volta para a fila: o `claim` do dispatch só aceita
 * `sending`, então reenfileirar a MESMA ação com o MESMO id devolve a linha
 * `failed` e o envio morre em 409. Aqui o reenvio ganha um id novo (linha nova,
 * falha anterior intacta no histórico) e a chave em memória passa a apontar
 * para ele — uma resposta perdida do reenvio continua idempotente.
 *
 * Concorrência (duplo clique): a checagem e a troca abaixo são síncronas, sem
 * `await` no meio — quem chega segundo vê a chave já apontando para o id novo
 * e ADOTA o voo do dono em vez de gerar outro id. Reutilizar o id sem adotar o
 * voo não bastaria: cada chamada despacharia e seriam 2 WhatsApps.
 *
 * Sem chave (`key` nulo) ou no caminho offline não há rotação: a drenagem da
 * fila e os ids explícitos mantêm o comportamento antigo.
 */
async function enqueueOrResendAfterDefinitiveFailure(
  enqueue: (clientMessageId: string) => Promise<EnqueueResult>,
  clientMessageId: string,
  key: string | null,
  offline: boolean,
): Promise<ResultadoEnqueue> {
  // Adotante espaçado pelo throttle: o dono já concluiu e aposentou este id
  // antes do nosso enqueue — nem enqueue fazemos, adotamos a entrega.
  if (!offline && key) {
    const previa = entregaDeIdAposentado(clientMessageId);
    if (previa) return { tipo: 'adotado', voo: Promise.resolve(previa), usedId: previa.id };
  }
  const first = await enqueue(clientMessageId);
  if (offline || !key || first.error || !first.data?.id || first.data.status !== 'failed') {
    return { tipo: 'enfileirado', queued: first, usedId: clientMessageId, voo: null };
  }
  const agora = Date.now();
  // O dono pode ter concluído (e aposentado este id) enquanto o nosso enqueue
  // estava em voo: adotar a entrega em vez de girar outro id.
  const aposentada = entregaDeIdAposentado(clientMessageId);
  if (aposentada) {
    return { tipo: 'adotado', voo: Promise.resolve(aposentada), usedId: aposentada.id };
  }
  const atual = pendingActionIds.get(key);
  if (atual && atual.expiresAt > agora && atual.id !== clientMessageId) {
    const voo = reenviosEmVoo.get(key);
    if (voo) return { tipo: 'adotado', voo: voo.promise, usedId: atual.id };
    return { tipo: 'enfileirado', queued: await enqueue(atual.id), usedId: atual.id, voo: null };
  }
  const retryId = createClientMessageId();
  pendingActionIds.set(key, { id: retryId, expiresAt: agora + PENDING_ACTION_TTL_MS });
  const voo = publicarVooReenvio(key);
  return { tipo: 'enfileirado', queued: await enqueue(retryId), usedId: retryId, voo };
}

/** Conclui o voo do reenvio para os adotantes e o tira do mapa. */
function concluirVooReenvio(key: string | null, voo: VooReenvio, entrega: OutboundMessageDeliveryResult): void {
  try {
    voo.concluir(entrega);
  } finally {
    if (key) reenviosEmVoo.delete(key);
  }
}

/** Rejeita o voo do reenvio para os adotantes e o tira do mapa. */
function falharVooReenvio(key: string | null, voo: VooReenvio, erro: unknown): void {
  try {
    voo.falhar(erro);
  } finally {
    if (key) reenviosEmVoo.delete(key);
  }
}

/**
 * Entrega de reenvio após falha definitiva, guardada pelo id ANTIGO aposentado.
 * Cobre o duplo clique ESPAÇADO pelo throttle (~500 ms): o primeiro envio já
 * terminou e limpou a chave quando o segundo chega segurando o id velho. Sem
 * este mapa, o segundo giraria OUTRO id novo e sairiam 2 WhatsApps.
 */
interface ReenvioConcluido {
  entrega: OutboundMessageDeliveryResult;
  expiraEm: number;
}

const reenviosConcluidos = new Map<string, ReenvioConcluido>();

/** Guarda a entrega do reenvio para adotantes espaçados que ainda seguram o id antigo. */
function aposentarIdDeReenvio(antigo: string, entrega: OutboundMessageDeliveryResult): void {
  reenviosConcluidos.set(antigo, { entrega, expiraEm: Date.now() + PENDING_ACTION_TTL_MS });
}

/** Devolve a entrega guardada quando o id já foi aposentado por um reenvio (ou null). */
function entregaDeIdAposentado(id: string): OutboundMessageDeliveryResult | null {
  const concluido = reenviosConcluidos.get(id);
  if (!concluido) return null;
  if (concluido.expiraEm <= Date.now()) {
    reenviosConcluidos.delete(id);
    return null;
  }
  // Adotante espaçado: não enviou de novo, adotou o envio do dono.
  return { ...concluido.entrega, idempotent: true };
}

/** Sem rede não há como enfileirar no servidor: a mensagem espera na fila local (item 025). */
function semRede(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function enqueueAndDispatch(
  input: SendOutboundMessageInput,
  clientMessageId: string,
  key: string | null,
  offline = false,
): Promise<OutboundMessageDeliveryResult> {
  // Generated database types intentionally stay bound to the canonical
  // database until the controlled migration is applied. This narrow transport
  // shape is removed by the post-deploy type-sync workflow.
  const rpcClient = supabase as unknown as AtomicQueueRpc;
  const resultado = await enqueueOrResendAfterDefinitiveFailure(
    (id) => rpcClient.rpc('enqueue_outbound_message', {
      p_contact_id: input.contactId,
      p_client_message_id: id,
      p_content: input.content,
      p_message_type: input.messageType ?? 'text',
      p_media_url: input.mediaUrl ?? undefined,
      p_reply_to_id: input.replyToId ?? undefined,
      p_whatsapp_connection_id: input.whatsappConnectionId ?? undefined,
      p_caption: input.caption ?? undefined,
    }),
    clientMessageId,
    key,
    offline,
  );
  // Adotante do duplo clique concorrente: o dono despacha, aqui só se aguarda
  // o mesmo voo — um dispatch só para a ação.
  if (resultado.tipo === 'adotado') return resultado.voo;
  const { queued, usedId, voo } = resultado;
  const queuedId = queued.data?.id;
  if (queued.error || !queuedId) {
    const erro = queued.error ?? new Error('Não foi possível enfileirar a mensagem.');
    if (voo) falharVooReenvio(key, voo, erro);
    throw erro;
  }
  try {
    const entrega = await dispatchQueuedMessage(queuedId, queued.data?.status ?? null, queued.data?.external_id ?? null);
    // Limpa com o id efetivamente usado (novo após falha definitiva): a guarda
    // impede uma chamada antiga de apagar a chave de uma ação mais nova.
    clearPendingAction(key, usedId);
    if (voo) {
      aposentarIdDeReenvio(clientMessageId, entrega);
      concluirVooReenvio(key, voo, entrega);
    }
    return entrega;
  } catch (erroDispatch) {
    if (voo) falharVooReenvio(key, voo, erroDispatch);
    throw erroDispatch;
  }
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
    null,
    true,
  );
  // Entrega concluída: a chave da ação morre junto. Sem isso, o mesmo texto
  // enviado depois pela aba reaproveitaria o id já entregue e a Edge o
  // descartaria como idempotente — o chat diria "enviada" sem sair nada.
  clearPendingAction(queuedActionKey(message), message.clientMessageId);
}

// A mensagem continua na fila e a próxima tentativa a reenvia; o aviso é o que
// impede a espera virar falha silenciosa. `console.warn` (e não o logger do app)
// mantém este módulo — caminho quente de todo envio — sem dependência nova de
// import, e é o MESMO aviso das duas drenagens (abertura e reconexão).
function avisarFilaOffline(error: unknown, message?: OfflineQueuedMessage): void {
  console.warn('Fila offline: entrega adiada', {
    clientMessageId: message?.clientMessageId ?? null,
    erro: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Drenagem da fila offline na ABERTURA do app (item 025), chamada pelo efeito
 * de sessão autenticada (`useOfflineSendQueueDrain`). Cobre o cenário que o
 * evento `online` não alcança: compõe offline, fecha a aba, reabre já com rede.
 */
export function drainOfflineSendQueue(): Promise<OfflineQueueDrainResult | null> {
  return drainOfflineQueueOnOpen(offlineSendQueue, deliverQueuedOfflineMessage, {
    onError: avisarFilaOffline,
    shouldDeliver: somenteDoUsuarioAtual,
  });
}

// Reconciliação ao reconectar (item 025): a fila local drena no evento `online`.
drainOfflineQueueOnReconnect(offlineSendQueue, deliverQueuedOfflineMessage, {
  onError: avisarFilaOffline,
  shouldDeliver: somenteDoUsuarioAtual,
});

// A fila offline é POR USUÁRIO no aparelho: item sem dono (legado) drena como
// antes; item com dono só sai na sessão dele — trocar de atendente na mesma
// máquina nunca envia o texto alheio.
function somenteDoUsuarioAtual(message: OfflineQueuedMessage): boolean {
  if (!message.userId) return true;
  return readAuthenticatedUserId() === message.userId;
}

async function enqueueOffline(
  input: SendOutboundMessageInput,
  clientMessageId: string,
): Promise<OutboundMessageDeliveryResult> {
  const queued = await offlineSendQueue.enqueue({
    userId: readAuthenticatedUserId() ?? undefined,
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

  if (semRede()) {
    // A fila offline guarda o PRÓPRIO id no item enfileirado, então a chave da
    // ação não precisa sobreviver a este envio. Deixá-la viva era o defeito: o
    // mesmo texto mandado depois, já online, reaproveitava o id e a Edge o
    // descartava como idempotente sem nenhum WhatsApp sair.
    const result = await enqueueOffline(input, clientMessageId);
    clearPendingAction(key, clientMessageId);
    return result;
  }

  const dedupeKey = actionKey(input);
  const claim = await crossTabSendDedupe.claim(dedupeKey, clientMessageId);
  if (!claim.owner) {
    // Outra aba já está mandando esta mesma ação: daqui não sai request nenhum.
    // A chave é a mesma, então as duas abas mostram a MESMA mensagem.
    return { id: claim.clientMessageId, status: 'pending', externalId: null, idempotent: true };
  }

  try {
    await sendThrottle.wait();
    const result = await enqueueAndDispatch(input, clientMessageId, key);
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
  const resultado = await enqueueOrResendAfterDefinitiveFailure(
    (id) => rpcClient.rpc('enqueue_rich_outbound_message', {
      p_contact_id: input.contactId,
      p_client_message_id: id,
      p_display_content: input.displayContent,
      p_message_type: input.messageType,
      p_delivery_payload: input.deliveryPayload,
      p_reply_to_id: input.replyToId ?? undefined,
      p_whatsapp_connection_id: input.whatsappConnectionId ?? undefined,
    }),
    clientMessageId,
    key,
    false,
  );
  if (resultado.tipo === 'adotado') return resultado.voo;
  const { queued, usedId, voo } = resultado;
  const queuedId = queued.data?.id;
  if (queued.error || !queuedId) {
    const erro = queued.error ?? new Error('Não foi possível enfileirar a mensagem estruturada.');
    if (voo) falharVooReenvio(key, voo, erro);
    throw erro;
  }
  try {
    const result = await dispatchQueuedMessage(queuedId, queued.data?.status ?? null, queued.data?.external_id ?? null);
    clearPendingAction(key, usedId);
    if (voo) {
      aposentarIdDeReenvio(clientMessageId, result);
      concluirVooReenvio(key, voo, result);
    }
    return result;
  } catch (erroDispatch) {
    if (voo) falharVooReenvio(key, voo, erroDispatch);
    throw erroDispatch;
  }
}
