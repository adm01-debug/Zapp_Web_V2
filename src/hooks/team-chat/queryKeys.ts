// Chaves de query centralizadas para o módulo team-chat (E55)
export const TEAM_KEYS = {
  all: ['team-chat'] as const,
  inbox: (profileId: string | undefined) =>
    ['team-chat', 'inbox', profileId] as const,
  messages: (conversationId: string) =>
    ['team-chat', 'messages', conversationId] as const,
  reactions: (conversationId: string) =>
    ['team-chat', 'reactions', conversationId] as const,
  readState: (conversationId: string) =>
    ['team-chat', 'read-state', conversationId] as const,
  members: (conversationId: string) =>
    ['team-chat', 'members', conversationId] as const,
} as const;
