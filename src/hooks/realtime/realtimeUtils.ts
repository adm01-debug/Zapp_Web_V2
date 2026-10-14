import { RealtimeMessage, ConversationContact, ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import type { UnsupportedMessageKind } from '@/types/chat';

/** `message_type` canônico (o que a UI sabe renderizar) para os tipos crus do WhatsApp. */
const RENDERABLE_MESSAGE_TYPES: Record<string, string> = {
  text: 'text',
  conversation: 'text',
  extendedTextMessage: 'text',
  image: 'image',
  imageMessage: 'image',
  video: 'video',
  videoMessage: 'video',
  audio: 'audio',
  audioMessage: 'audio',
  document: 'document',
  documentMessage: 'document',
  documentWithCaptionMessage: 'document',
  sticker: 'sticker',
  stickerMessage: 'sticker',
  location: 'location',
  locationMessage: 'location',
  interactive: 'interactive',
};

const POLL_MESSAGE_TYPES = new Set([
  'poll',
  'pollCreationMessage',
  'pollCreationMessageV2',
  'pollCreationMessageV3',
  'pollUpdateMessage',
]);

const VIEW_ONCE_MESSAGE_TYPES = new Set([
  'view_once',
  'viewOnce',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
]);

const CONTACT_MESSAGE_TYPES = new Set([
  'contact',
  'contactMessage',
  'contactsArrayMessage',
]);

/**
 * Tipos de protocolo/controle: nunca viram balão. Se fossem traduzidos para
 * 'unsupported' apareceria um balão para um evento que não é mensagem do usuário.
 *
 * Ficam aqui SÓ os tipos que nunca carregam conteúdo de usuário. `ephemeralMessage`
 * NÃO entra: é o invólucro do modo temporário — por dentro há mensagem real do
 * usuário (texto/mídia gravados em `content`/`media_url`). Tratar como controle
 * engoliria esse conteúdo; com payload ele segue a regra do desconhecido e cai em
 * 'unsupported'/'other'. `messageContextInfo` também não entra: é metadado de
 * protocolo, mas se um dia chegar com conteúdo/mídia não pode sumir — a checagem
 * abaixo só o trata como controle quando vem sem payload.
 */
const CONTROL_MESSAGE_TYPES = new Set([
  'protocolMessage',
  'senderKeyDistributionMessage',
  'reactionMessage',
  'reaction',
  'stickerSyncRmrMessage',
]);

export interface MessageTypeClassification {
  /** Valor de `message_type` depois da tradução. */
  messageType: string;
  /** Presente quando a mensagem deve cair no balão de fallback. */
  unsupportedKind?: UnsupportedMessageKind;
  /** Tipo de controle: fica fora da conversa, não gera balão. */
  isControl: boolean;
}

/**
 * Traduz o `message_type` cru (public.messages / evolution_messages) para o que a
 * UI do Zapp Web V2 sabe renderizar.
 *
 * O webhook grava o nome cru (`poll`, `contact`, `pollCreationMessage`,
 * `protocolMessage`…). Antes, quem não estava no mapa virava 'text' e um balão
 * vazio: aqui a decisão fica num lugar só — enquete, visualização única e contato
 * caem em 'unsupported' com o motivo; tipo desconhecido QUE TRAZ conteúdo/mídia
 * também vira 'unsupported'/'other' (em vez de 'text' vazio); controle continua
 * com o nome cru para não virar balão. Exceções: `ephemeralMessage` (invólucro do
 * modo temporário, por dentro há mensagem real) nunca é controle; `messageContextInfo`
 * só é controle quando vem sem payload — com conteúdo/mídia seguem a regra do
 * desconhecido.
 *
 * @param hasPayload se a mensagem traz `content`/mídia (decide o destino do desconhecido).
 */
export function classifyMessageType(
  rawType: string | null | undefined,
  hasPayload: boolean,
): MessageTypeClassification {
  const raw = (rawType ?? '').trim();

  if (CONTROL_MESSAGE_TYPES.has(raw)) {
    return { messageType: raw, isControl: true };
  }

  // `messageContextInfo` é metadado de protocolo (nunca conteúdo do usuário), mas
  // só pode ser tratado como controle quando vem SEM payload: se um dia chegar com
  // conteúdo/mídia, engolir como controle sumiria com conteúdo real — nesse caso
  // segue a regra do desconhecido abaixo ('unsupported'/'other').
  if (raw === 'messageContextInfo' && !hasPayload) {
    return { messageType: raw, isControl: true };
  }

  if (POLL_MESSAGE_TYPES.has(raw)) {
    return { messageType: 'unsupported', unsupportedKind: 'poll', isControl: false };
  }
  if (VIEW_ONCE_MESSAGE_TYPES.has(raw)) {
    return { messageType: 'unsupported', unsupportedKind: 'view_once', isControl: false };
  }
  if (CONTACT_MESSAGE_TYPES.has(raw)) {
    return { messageType: 'unsupported', unsupportedKind: 'contact', isControl: false };
  }

  const renderable = RENDERABLE_MESSAGE_TYPES[raw];
  if (renderable) {
    return { messageType: renderable, isControl: false };
  }

  // Desconhecido: com conteúdo/mídia vira fallback visível; sem nada, mantém o
  // nome cru para não inventar um balão para um evento vazio.
  if (hasPayload) {
    return { messageType: 'unsupported', unsupportedKind: 'other', isControl: false };
  }
  return { messageType: raw, isControl: false };
}

/** RealtimeMessage já normalizada; pode carregar o motivo do fallback. */
export type NormalizedRealtimeMessage = RealtimeMessage & {
  unsupportedKind?: UnsupportedMessageKind;
};

export function normalizeMessage(message: RealtimeMessage): NormalizedRealtimeMessage {
  const classification = classifyMessageType(
    message.message_type,
    Boolean(message.content || message.media_url || message.caption),
  );
  return {
    ...message,
    message_type: classification.messageType,
    ...(classification.unsupportedKind ? { unsupportedKind: classification.unsupportedKind } : {}),
    status: message.status ?? 'sent',
    status_updated_at: message.status_updated_at ?? null,
  };
}

export function sortMessagesByCreatedAt(messages: RealtimeMessage[]): RealtimeMessage[] {
  return [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

/**
 * Agregado POR CONTATO vindo do banco (RPC get_inbox_contact_summaries).
 *
 * Existe porque a carga inicial da inbox recebe uma amostra GLOBAL de mensagens
 * (RECENT_MESSAGES_LIMIT em realtime.service.ts) que pode não alcançar um contato
 * ativo — o histórico dele então parecia vazio e a contagem de não lidas zerava
 * (R2-INB-005). Os valores daqui são a fonte de verdade do banco para esse contato.
 */
export interface ContactConversationSummary {
  unreadCount: number;
  lastMessage: RealtimeMessage;
}

export function buildConversation(
  contact: ConversationContact,
  messages: RealtimeMessage[],
  summary?: ContactConversationSummary | null
): ConversationWithMessages {
  // Contato cuja amostra global não trouxe NENHUMA mensagem: a conversa é montada
  // a partir do agregado do banco (última mensagem + não lidas). Sem isso a conversa
  // voltava com histórico vazio e zero não lidas e sumia da aba "abertas"
  // (useInboxFilters exige messages.length > 0). Quem está na amostra continua
  // exatamente como antes — o agregado só cobre a lacuna.
  const semAmostra = messages.length === 0 && Boolean(summary);
  const effectiveMessages = semAmostra && summary ? [summary.lastMessage] : messages;

  const sortedMessages = sortMessagesByCreatedAt(effectiveMessages);
  const unreadCount = semAmostra
    ? summary?.unreadCount ?? 0
    : sortedMessages.filter((message) => !message.is_read && message.sender === 'contact').length;
  const lastMessage = sortedMessages.length > 0 ? sortedMessages[sortedMessages.length - 1] : null;

  return { contact, messages: sortedMessages, unreadCount, lastMessage };
}

export function dedupeContacts(contacts: ConversationContact[]): ConversationContact[] {
  const contactsMap = new Map<string, ConversationContact>();
  contacts.forEach((contact) => contactsMap.set(contact.id, contact));
  return Array.from(contactsMap.values());
}

export function getUniqueMessageContactIds(messages: RealtimeMessage[]): string[] {
  return Array.from(
    new Set(messages.map((m) => m.contact_id).filter((id): id is string => Boolean(id)))
  );
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function buildConversations(
  contacts: ConversationContact[],
  messages: RealtimeMessage[],
  summaries?: Map<string, ContactConversationSummary> | null
): ConversationWithMessages[] {
  const messagesByContact = new Map<string, RealtimeMessage[]>();
  messages.forEach((message) => {
    if (!message.contact_id) return;
    const existing = messagesByContact.get(message.contact_id) ?? [];
    existing.push(message);
    messagesByContact.set(message.contact_id, existing);
  });

  return dedupeContacts(contacts)
    .map((contact) =>
      buildConversation(
        contact,
        messagesByContact.get(contact.id) ?? [],
        summaries?.get(contact.id) ?? null
      )
    )
    .sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.contact.created_at;
      const bTime = b.lastMessage?.created_at || b.contact.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
}
