/**
 * Item 082 do `docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md`
 * ("Tracking de e-mail: pixel + link") — METADE CLIENTE.
 *
 * As duas Edge Functions públicas (`email-track-pixel` / `email-track-link`) e as colunas
 * `opened_at` / `clicked_at` são de outra trilha: aqui não se cria DDL nem Edge Function.
 * O que mora neste módulo é a regra que o aceite do item exige do lado do cliente:
 *
 * - a URL de rastreamento carrega só um TOKEN OPACO — o `email_messages.id` (UUID) — e nunca
 *   dado do destinatário (e-mail, nome, telefone): PII em URL vaza em log, proxy e Referer;
 * - o alvo do link só aceita http(s) absoluto, então o redirect não vira open redirect para
 *   `javascript:`/`data:` nem aceita caminho relativo;
 * - o `<img>` do pixel sai marcado com `data-zapp-track`, para que resposta e encaminhamento
 *   possam tirar o rastreamento do conteúdo citado antes de reenviá-lo.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EmailTrackingEvent = 'open' | 'click';

/** Nome da Edge Function pública de cada evento — URL final: `${base}/functions/v1/${nome}`. */
export const EMAIL_TRACKING_ENDPOINT: Record<EmailTrackingEvent, string> = {
  open: 'email-track-pixel',
  click: 'email-track-link',
};

/** Marca o `<img>` do pixel para que o rastreamento possa ser removido depois. */
export const EMAIL_TRACKING_PIXEL_ATTR = 'data-zapp-track';

/** Token opaco do rastreamento: só o id UUID da mensagem passa. Espaços nas bordas caem. */
export function resolveTrackingToken(messageId: string | null | undefined): string | null {
  const value = typeof messageId === 'string' ? messageId.trim() : '';
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}

function trackingEndpoint(baseUrl: string, event: EmailTrackingEvent): string | null {
  const base = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : '';
  return base ? `${base}/functions/v1/${EMAIL_TRACKING_ENDPOINT[event]}` : null;
}

/** URL do pixel de abertura (`?m=`), ou null quando o id não é o UUID esperado. */
export function buildEmailTrackingPixelUrl(params: {
  baseUrl: string;
  messageId: string | null | undefined;
}): string | null {
  const token = resolveTrackingToken(params.messageId);
  const endpoint = trackingEndpoint(params.baseUrl, 'open');
  if (!token || !endpoint) return null;
  const url = `${endpoint}?m=${token}`;
  // Guarda final do aceite: nenhuma URL de rastreamento pode carregar '@' (PII).
  return url.includes('@') ? null : url;
}

/** `<img>` 1x1 do pixel de abertura, pronto para entrar no HTML enviado. */
export function buildEmailTrackingPixelHtml(params: {
  baseUrl: string;
  messageId: string | null | undefined;
}): string | null {
  const url = buildEmailTrackingPixelUrl(params);
  if (!url) return null;
  return `<img src="${url}" width="1" height="1" alt="" ${EMAIL_TRACKING_PIXEL_ATTR}="open" />`;
}

/** URL de clique: embrulha um alvo http(s) absoluto (`?m=` token + `&u=` alvo codificado). */
export function buildEmailTrackingLinkUrl(params: {
  baseUrl: string;
  messageId: string | null | undefined;
  target: string;
}): string | null {
  const token = resolveTrackingToken(params.messageId);
  const endpoint = trackingEndpoint(params.baseUrl, 'click');
  if (!token || !endpoint) return null;

  let parsed: URL;
  try {
    parsed = new URL(params.target);
  } catch {
    return null; // relativo não tem origem confiável para redirecionar
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const url = `${endpoint}?m=${token}&u=${encodeURIComponent(params.target)}`;
  return url.includes('@') ? null : url;
}

function hasTrackingMarker(tag: string): boolean {
  return new RegExp(`${EMAIL_TRACKING_PIXEL_ATTR}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i').test(tag);
}

/** Tira o pixel de rastreamento do HTML (usado ao responder/encaminhar conteúdo já rastreado). */
export function stripEmailTrackingPixels(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, tag => (hasTrackingMarker(tag) ? '' : tag));
}
