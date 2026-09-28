export const teamChatKeys = {
  all: ['team-chat'] as const,
  conversations: () => [...teamChatKeys.all, 'conversations'] as const,
  conversation: (id: string) => [...teamChatKeys.conversations(), id] as const,
  messages: (conversationId: string) => [...teamChatKeys.all, 'messages', conversationId] as const,
  messagePages: (conversationId: string) => [...teamChatKeys.messages(conversationId), 'pages'] as const,
  reactions: (conversationId: string) => [...teamChatKeys.all, 'reactions', conversationId] as const,
  readState: (conversationId: string) => [...teamChatKeys.all, 'read-state', conversationId] as const,
  members: (conversationId: string) => [...teamChatKeys.all, 'members', conversationId] as const,
};
