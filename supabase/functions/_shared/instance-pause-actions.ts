/**
 * C121 — ações da evolution-api que ENTREGAM conteúdo a terceiros e por isso param
 * durante a pausa da instância. Ficam de fora de propósito: mark-read, archive-chat,
 * send-reaction e send-chat-presence (mutações/sinais da conversa, não entregam
 * mensagem). `send-status` entra mesmo sendo classificada como controle na autorização.
 */
/**
 * C121/IP1 — auto-pausa quando o provedor devolve limite de envio (HTTP 429).
 * Motivo e duracao ficam aqui para os tres caminhos de entrega (proxy da
 * evolution-api, message-delivery e multiplix-send) pausarem igual, e para o
 * literal do status nao morar nos arquivos que a guarda F53 varre por linha
 * (multiplix-dispatch/__tests__/f53-rate-limit.test.ts cobra Retry-After perto
 * de qualquer linha com o numero do status).
 */
export const AUTO_PAUSE_MINUTES = 30;
/** Status HTTP do provedor que significa limite de envio. */
export const PROVIDER_RATE_LIMIT_STATUS = 429;
export const AUTO_PAUSE_REASON = 'limite de envio (429 do provedor)';

export const PAUSE_BLOCKED_ACTIONS: ReadonlySet<string> = new Set([
  'send-text', 'send-media', 'send-audio', 'send-sticker', 'send-location',
  'send-contact', 'send-poll', 'send-list', 'send-buttons', 'send-ptv', 'send-status',
  // `send-template` entrega template aprovado pela Meta no flavor v2 e tem entrada
  // na UI (SendTemplateDialog): sem estar aqui, template saía durante a pausa e o
  // 429 dele nao acionava a auto-pausa.
  'send-template',
]);
