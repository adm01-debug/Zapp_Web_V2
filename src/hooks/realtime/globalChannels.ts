/**
 * Nomes canônicos dos canais globais (sem filtro) de `messages` e `contacts`.
 * Todo consumidor que precisa ouvir a tabela inteira usa ESTES nomes: o
 * `useSupabaseRealtime` divide o canal físico entre eles (contagem de donos),
 * então a aba mantém uma assinatura por tabela — cada recibo passa pela RLS do
 * Realtime uma vez, não uma por consumidor.
 */
export const GLOBAL_MESSAGES_CHANNEL = 'global-messages-realtime';
export const GLOBAL_CONTACTS_CHANNEL = 'global-contacts-realtime';
