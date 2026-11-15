/**
 * C121 — ações da evolution-api que ENTREGAM conteúdo a terceiros e por isso param
 * durante a pausa da instância. Ficam de fora de propósito: mark-read, archive-chat,
 * send-reaction e send-chat-presence (mutações/sinais da conversa, não entregam
 * mensagem). `send-status` entra mesmo sendo classificada como controle na autorização.
 */
export const PAUSE_BLOCKED_ACTIONS: ReadonlySet<string> = new Set([
  'send-text', 'send-media', 'send-audio', 'send-sticker', 'send-location',
  'send-contact', 'send-poll', 'send-list', 'send-buttons', 'send-ptv', 'send-status',
]);
