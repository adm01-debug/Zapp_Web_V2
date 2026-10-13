import type { QueryKey } from '@tanstack/react-query';

/**
 * SL-081 (F52) — chave de cache do Team Chat como fonte única.
 *
 * Antes cada arquivo escrevia o literal da chave (`['team-messages', cid]`) e a
 * mutação escrevia o mesmo literal de novo. Duas strings parecidas em arquivos
 * diferentes é como a invalidação some sem ninguém ver. Aqui a chave é montada
 * uma vez: quem registra a query e quem invalida chamam a MESMA fábrica.
 *
 * Os VALORES são os literais históricos, byte a byte — trocar um deles muda o
 * cache e deixa de casar com quem já invalida por prefixo. Está travado em
 * `__tests__/queryKeys.test.ts`.
 *
 * Invalidação é por prefixo, então a fábrica do inbox devolve a RAIZ quando não
 * recebe o perfil: `inbox()` -> `['team-conversations']`, que alcança o inbox de
 * qualquer perfil; `inbox(profileId)` é a chave que a query usa. Devolver
 * `['team-conversations', undefined]` não casaria com nada.
 */
export const queryKeys = {
  inbox: (profileId?: string | null): QueryKey =>
    profileId === undefined || profileId === null
      ? ['team-conversations']
      : ['team-conversations', profileId],
  messages: (conversationId: string | null): QueryKey => ['team-messages', conversationId],
  /**
   * Estado de leitura agregado (view `team_message_read_state`). A raiz
   * (sem `idsKey`) é a chave que a invalidação por prefixo usa quando chega
   * recibo ao vivo; a chave da query acrescenta os ids próprios da página,
   * ordenados, para que a mesma página não gere chave nova a cada render.
   */
  readState: (conversationId: string | null, idsKey?: string): QueryKey =>
    idsKey === undefined
      ? ['team-message-read-state', conversationId]
      : ['team-message-read-state', conversationId, idsKey],
  reactions: (conversationId: string): QueryKey => ['team-reactions', conversationId],
  /** O último elemento é o `join` dos ids: a chave histórica juntava os membros assim. */
  members: (conversationId: string, memberIds: string[]): QueryKey => [
    'team-group-members',
    conversationId,
    memberIds.join(','),
  ],
  memberProfile: (profileId: string): QueryKey => ['team-member-profile', profileId],
  performance: (conversationId: string): QueryKey => [
    'departmentChat',
    'performance',
    conversationId,
  ],
  participantStats: (conversationId: string): QueryKey => [
    'departmentChat',
    'participantStats',
    conversationId,
  ],
  departments: {
    list: (): QueryKey => ['departmentChat', 'list'],
    /**
     * Sem o id do departamento de propósito: `get_team_profiles` devolve a lista
     * inteira, o cache é um só e as mutações de membro invalidam ele todo.
     */
    members: (): QueryKey => ['departmentChat', 'profiles'],
    invites: (departmentId: string): QueryKey => ['departmentChat', 'invites', departmentId],
    audit: (departmentId: string): QueryKey => ['departmentChat', 'audit', departmentId],
    whatsapp: (departmentId: string): QueryKey => ['departmentChat', 'whatsapp', departmentId],
  },
} as const;
