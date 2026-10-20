/**
 * Rascunho de conversa do Inbox — SEC-FRONTEND-03 (auditoria de 07/10/2026).
 *
 * O rascunho pertence ao USUÁRIO, não ao navegador: a chave leva o id do usuário
 * (`zapp.inbox.draft:<userId>:<contactId>` — convenção da casa `zapp.<area>:<userId>`,
 * a mesma do chat de equipe) para que o texto de um atendente nunca reapareça para
 * outro na mesma máquina. O formato antigo (`chat_draft_<contactId>`, sem dono) é
 * apagado sem leitura na montagem e tudo do prefixo novo sai no sign-out, ao lado
 * de `clearEmailDraftSessions()`.
 *
 * O acesso ao storage é feito aqui mesmo, dentro de `try/catch`: storage indisponível
 * (modo privado, cota estourada) nunca quebra o campo de mensagem — mesmo padrão do
 * `useTeamChatDraft`.
 */

export const INBOX_DRAFT_KEY_PREFIX = 'zapp.inbox.draft:';
/** Formato anterior a este cartão: só o id do contato, sem escopo por usuário. */
export const LEGACY_INBOX_DRAFT_KEY_PREFIX = 'chat_draft_';

/** Chave do rascunho do usuário naquele contato; `null` sem usuário ou sem contato. */
export function inboxDraftStorageKey(userId: string | null | undefined, contactId: string | null | undefined): string | null {
  if (!userId || !contactId) return null;
  return `${INBOX_DRAFT_KEY_PREFIX}${userId}:${contactId}`;
}

export function readInboxDraft(key: string | null): string | null {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeInboxDraft(key: string | null, text: string): void {
  if (!key) return;
  try {
    localStorage.setItem(key, text);
  } catch { /* storage unavailable */ }
}

export function removeInboxDraft(key: string | null): void {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch { /* storage unavailable */ }
}

/**
 * Esvazia o formato legado sem ler: o texto gravado antes do escopo por usuário não
 * tem dono, então não pode ser restaurado para ninguém. Retorna quantas chaves saíram.
 */
export function purgeLegacyInboxDrafts(): number {
  return purgeByPrefix(LEGACY_INBOX_DRAFT_KEY_PREFIX);
}

/** Chamado no `SIGNED_OUT`: nenhum rascunho de Inbox sobrevive ao logout. */
export function clearInboxDraftSessions(): number {
  return purgeByPrefix(INBOX_DRAFT_KEY_PREFIX);
}

function purgeByPrefix(prefix: string): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
    return doomed.length;
  } catch {
    return 0;
  }
}
