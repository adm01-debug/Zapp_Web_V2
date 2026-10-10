import { RealtimeMessage, ConversationContact, ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

export function normalizeMessage(message: RealtimeMessage): RealtimeMessage {
  return {
    ...message,
    status: message.status ?? 'sent',
    status_updated_at: message.status_updated_at ?? null,
  };
}

export function sortMessagesByCreatedAt(messages: RealtimeMessage[]): RealtimeMessage[] {
  return [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export function buildConversation(
  contact: ConversationContact,
  messages: RealtimeMessage[]
): ConversationWithMessages {
  const sortedMessages = sortMessagesByCreatedAt(messages);
  const unreadCount = sortedMessages.filter(
    (message) => !message.is_read && message.sender === 'contact'
  ).length;
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
  messages: RealtimeMessage[]
): ConversationWithMessages[] {
  const messagesByContact = new Map<string, RealtimeMessage[]>();
  messages.forEach((message) => {
    if (!message.contact_id) return;
    const existing = messagesByContact.get(message.contact_id) ?? [];
    existing.push(message);
    messagesByContact.set(message.contact_id, existing);
  });

  return dedupeContacts(contacts)
    .map((contact) => buildConversation(contact, messagesByContact.get(contact.id) ?? []))
    .sort((a, b) => {
      const aTime = a.lastMessage?.created_at || a.contact.created_at;
      const bTime = b.lastMessage?.created_at || b.contact.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
}
