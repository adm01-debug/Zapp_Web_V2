import { isToday, isYesterday } from 'date-fns';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

export type ConversationGroupName = 'Fixadas' | 'Hoje' | 'Ontem' | 'Mais antigas';
export type ConversationListEntry =
  | { kind: 'header'; key: string; title: ConversationGroupName; count: number; pinned: boolean }
  | { kind: 'conversation'; key: string; conversation: ConversationWithMessages };

export function conversationDate(conversation: ConversationWithMessages) {
  const raw = conversation.lastMessage?.created_at
    ?? conversation.contact.updated_at
    ?? conversation.contact.created_at;
  const date = raw ? new Date(raw) : new Date(0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function groupName(
  conversation: ConversationWithMessages,
): Exclude<ConversationGroupName, 'Fixadas'> {
  const date = conversationDate(conversation);
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return 'Mais antigas';
}

export function buildConversationListEntries(
  conversations: ConversationWithMessages[],
  pinnedIds: Set<string>,
): ConversationListEntry[] {
  const valid = conversations.filter((conversation) => conversation?.contact?.id);
  const pinned = valid.filter((conversation) => pinnedIds.has(conversation.contact.id));
  const remaining = valid.filter((conversation) => !pinnedIds.has(conversation.contact.id));
  const entries: ConversationListEntry[] = [];

  const appendGroup = (
    title: ConversationGroupName,
    items: ConversationWithMessages[],
    pinnedGroup = false,
  ) => {
    if (items.length === 0) return;
    entries.push({ kind: 'header', key: `header-${title}`, title, count: items.length, pinned: pinnedGroup });
    entries.push(...items.map((conversation) => ({
      kind: 'conversation' as const,
      key: `conversation-${conversation.contact.id}`,
      conversation,
    })));
  };

  appendGroup('Fixadas', pinned, true);
  for (const title of ['Hoje', 'Ontem', 'Mais antigas'] as const) {
    appendGroup(title, remaining.filter((conversation) => groupName(conversation) === title));
  }

  return entries;
}
