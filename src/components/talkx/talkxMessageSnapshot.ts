/**
 * The delivery worker persists an immutable personalized message immediately
 * before dispatch. Never fall back to the mutable campaign template here: a
 * UI preview must distinguish a pending snapshot from unavailable history.
 */
export function talkXMessageSnapshotDisplay(
  personalizedMessage: string | null,
  recipientStatus: string,
): string {
  if (personalizedMessage?.trim()) return personalizedMessage;
  if (recipientStatus === 'pending' || recipientStatus === 'sending') {
    return 'A mensagem ainda não foi materializada para este destinatário.';
  }
  return 'O conteúdo histórico desta mensagem não está disponível.';
}
