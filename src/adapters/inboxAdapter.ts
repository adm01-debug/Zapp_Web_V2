import { Message, Conversation, ConversationContact, MessageRow } from '@/types/chat';
import { RealtimeMessage, ConversationWithMessages, ConversationContact as RealtimeContact } from '@/hooks/chat/useRealtimeMessages';
import { normalizeOperationalPriority } from '@/lib/ai-vocabulary';

function parseLocation(content: string): Message['location'] | undefined {
  try {
    const value = JSON.parse(content) as Record<string, unknown>;
    if (typeof value.latitude !== 'number' || !Number.isFinite(value.latitude) || value.latitude < -90 || value.latitude > 90 ||
        typeof value.longitude !== 'number' || !Number.isFinite(value.longitude) || value.longitude < -180 || value.longitude > 180) {
      return undefined;
    }
    return {
      latitude: value.latitude,
      longitude: value.longitude,
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
      ...(typeof value.address === 'string' ? { address: value.address } : {}),
    };
  } catch {
    return undefined;
  }
}

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
    ...(row.message_type === 'location' ? { location: parseLocation(row.content) } : {}),
  };
}

export function mapRealtimeContactToContact(rc: RealtimeContact): ConversationContact {
  return {
    ...rc,
    avatar: rc.avatar_url || undefined,
    createdAt: new Date(rc.created_at),
    tags: rc.tags || [],
    conversation_status: rc.conversation_status as ConversationContact['conversation_status'],
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
    ...(rm.message_type === 'location' ? { location: parseLocation(rm.content) } : {}),
  };
}

/** Linha do embed `conversation_sla` (o select pede os dois campos). */
export interface SlaCycleRow {
  first_message_at: string | null;
  first_response_at: string | null;
}

/** Mínimo de uma mensagem para reconhecer entrada do cliente e resposta humana. */
export interface SlaCycleMessage {
  sender: string;
  created_at: string;
  status?: string | null;
  is_deleted?: boolean | null;
}

function toTime(value: string | null | undefined): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** `sending`/`failed` não respondem o cliente — mesma regra do banco e do envio. */
function isHumanReply(message: SlaCycleMessage): boolean {
  return message.sender === 'agent' && message.status !== 'failed' && message.status !== 'sending';
}

/**
 * Início do ciclo ABERTO do cronômetro de 1ª resposta (PB-34).
 *
 * Um ciclo abre quando o cliente escreve e fecha quando um humano responde;
 * a cada nova mensagem do cliente o cronômetro REINICIA. Devolve `null`
 * quando não há ciclo aberto (cliente respondido e sem nova mensagem), que é
 * quando a tela não deve mostrar timer nenhum.
 *
 * Fontes, na ordem que o cartão define:
 * - a linha aberta de `conversation_sla` (`first_response_at IS NULL`), que é
 *   o ciclo canônico do servidor — usada quando as mensagens carregadas não
 *   mostram resposta humana posterior a ela (linha aberta obsoleta, que nunca
 *   fechou, não pode manter o timer preso em atendimento antigo);
 * - a última mensagem do cliente SEM resposta humana depois, derivada das
 *   mensagens carregadas (a linha do banco só nasce quando alguém responde).
 */
export function resolveFirstResponseCycleStart(input: {
  slaRows?: SlaCycleRow[] | null;
  messages?: SlaCycleMessage[] | null;
}): Date | null {
  const loaded = (input.messages ?? []).filter(m => !m.is_deleted);
  let lastInboundMs: number | null = null;
  let lastReplyMs: number | null = null;
  for (const message of loaded) {
    const ms = toTime(message.created_at);
    if (ms === null) continue;
    if (message.sender === 'contact') {
      if (lastInboundMs === null || ms > lastInboundMs) lastInboundMs = ms;
    } else if (isHumanReply(message)) {
      if (lastReplyMs === null || ms > lastReplyMs) lastReplyMs = ms;
    }
  }

  const candidates: number[] = [];

  const openStartMs = toTime(
    (input.slaRows ?? []).find(r => r.first_response_at == null)?.first_message_at,
  );
  if (openStartMs !== null && (lastReplyMs === null || lastReplyMs <= openStartMs)) {
    candidates.push(openStartMs);
  }

  if (lastInboundMs !== null && (lastReplyMs === null || lastReplyMs < lastInboundMs)) {
    candidates.push(lastInboundMs);
  }

  if (candidates.length === 0) return null;
  return new Date(Math.max(...candidates));
}

export function mapRealtimeConversationToConversation(rc: ConversationWithMessages): Conversation {
  // SLA de 1a resposta: prioridade para o canônico do banco (conversation_sla),
  // que existe mesmo quando a janela de mensagens veio vazia; fallback no
  // derivado da primeira mensagem do atendente efetivamente enviada.
  const slaRows = (rc.contact as RealtimeContact & {
    conversation_sla?: SlaCycleRow[] | null;
  }).conversation_sla;
  // canonico: se existe linha ABERTA (sem resposta), a pendencia esta viva e
  // firstResponseAt DEVE ser null (cronometro conta). So usamos a linha
  // respondida mais recente quando NAO ha linha aberta no banco.
  const cycleStart = resolveFirstResponseCycleStart({ slaRows, messages: rc.messages });
  const slaAnswered = cycleStart
    ? null
    : [...(slaRows ?? [])]
        .filter(r => r.first_response_at != null)
        .sort((a, b) => (a.first_response_at ?? '').localeCompare(b.first_response_at ?? ''))
        .pop() ?? null;

  const firstAgentMessage = rc.messages
    .filter(m => m.sender === 'agent' && m.status !== 'failed' && m.status !== 'sending')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

  const operationalPriority = normalizeOperationalPriority(
    (rc.contact as { ai_priority?: string | null }).ai_priority,
  ).value;
  const priority: Conversation['priority'] =
    operationalPriority === 'high' || operationalPriority === 'urgent'
      ? 'high'
      : operationalPriority === 'low'
        ? 'low'
        : 'medium';

  return {
    id: rc.contact.id,
    contact: mapRealtimeContactToContact(rc.contact),
    lastMessage: rc.lastMessage ? mapRealtimeMessageToMessage(rc.lastMessage, rc.contact.id) : undefined,
    unreadCount: rc.unreadCount,
    status: 'open',
    priority,
    tags: rc.contact.tags || [],
    createdAt: new Date(rc.contact.created_at),
    updatedAt: new Date(rc.contact.updated_at),
    firstResponseAt: cycleStart
      ? null // ciclo aberto (mensagem do cliente ainda sem resposta humana): cronometro conta
      : slaAnswered?.first_response_at
        ? new Date(slaAnswered.first_response_at)
        : firstAgentMessage ? new Date(firstAgentMessage.created_at) : null,
    assignedTo: rc.contact.assigned_to ? { id: rc.contact.assigned_to, name: 'Atendente' } : null,
    sentiment: rc.contact.ai_sentiment,
  };
}
