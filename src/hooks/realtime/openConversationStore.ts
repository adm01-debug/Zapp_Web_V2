/**
 * A "conversa aberta na tela" tem UMA fonte, fora do React.
 *
 * Antes ela vivia num `useRef` de `useRealtimeNotifications` — um ref por
 * instância. Com o aviso global (montado no AppShell) passaram a existir DUAS
 * instâncias decidindo se devem avisar, e cada uma tinha a sua cópia da
 * seleção: o aviso global não sabia qual conversa estava aberta e avisava (som
 * + notificação) por cima do que o usuário já estava lendo.
 *
 * Módulo (e não contexto) porque o leitor é chamado de dentro de um callback de
 * Realtime, que precisa do valor no INSTANTE do evento — sem re-render no meio.
 */

let openContactId: string | null = null;

export function setOpenConversationId(contactId: string | null): void {
  openContactId = contactId;
}

export function getOpenConversationId(): string | null {
  return openContactId;
}

/**
 * Verdadeiro só quando a mensagem é da conversa aberta E a aba está visível:
 * aí o usuário está lendo ali mesmo e não há o que avisar. Conversa aberta com
 * a aba oculta (troca de aba/minimizado) NÃO suprime — é justamente o caso em
 * que o aviso faz falta.
 */
export function isConversationOpenOnScreen(contactId: string | null | undefined): boolean {
  if (!contactId || openContactId !== contactId) return false;
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
}

/** Limpa a seleção (desmontagem do consumidor e isolamento entre testes). */
export function resetOpenConversation(): void {
  openContactId = null;
}
