/**
 * Rascunho do Chat de Equipe — HZ2-016 (paridade 26).
 *
 * O rascunho pertence ao USUÁRIO, não ao navegador: a chave leva o id do usuário
 * (`zapp.teamchat.draft:<userId>:<conversationId>` — convenção da casa
 * `zapp.<area>:<userId>`, a mesma do rascunho do Inbox). Em computador
 * compartilhado, nenhum texto de quem saiu pode esperar o próximo login: todo o
 * prefixo sai no `SIGNED_OUT`, ao lado de `clearInboxDraftSessions()`.
 *
 * O acesso ao storage fica aqui dentro, em `try/catch`: storage indisponível
 * (modo privado, cota estourada) nunca quebra o campo de mensagem — mesmo padrão
 * do `inboxDraftSession`.
 */

export const TEAM_CHAT_DRAFT_KEY_PREFIX = 'zapp.teamchat.draft:';

/** Chave do rascunho do usuário naquela conversa. */
export function teamDraftStorageKey(userId: string, conversationId: string): string {
  return `${TEAM_CHAT_DRAFT_KEY_PREFIX}${userId}:${conversationId}`;
}

/** Chamado no `SIGNED_OUT`: nenhum rascunho do Chat de Equipe sobrevive ao logout. */
export function clearTeamChatDraftSessions(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(TEAM_CHAT_DRAFT_KEY_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
    return doomed.length;
  } catch {
    return 0;
  }
}
