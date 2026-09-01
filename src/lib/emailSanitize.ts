/**
 * emailSanitize.ts — Sanitização segura de HTML de e-mail
 *
 * - Whitelist ampliada para e-mail real (tabelas, imagens, formatação inline)
 * - Hook afterSanitizeAttributes:
 *     · forçar target="_blank" + rel seguro em <a>
 *     · rejeitar src/href com esquemas perigosos
 *     · bloquear imagens remotas → data-blocked-src (E36)
 *     · remover position/z-index/fixed de style inline
 *     · filtrar background-image com URL remota em style
 * - Cache LRU por message ID (max 200)
 */

import DOMPurify from 'dompurify';

// ── Tags permitidas ──────────────────────────────────────────────────────────
const EMAIL_ALLOWED_TAGS = [
  // Estrutura
  'html', 'head', 'body',
  // Layout
  'div', 'span', 'section', 'article', 'main', 'header', 'footer', 'nav',
  // Texto
  'p', 'br', 'hr', 'pre', 'code', 'blockquote',
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Listas
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Inline
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark',
  'small', 'sub', 'sup', 'abbr', 'cite', 'q', 'time', 'wbr',
  // Links
  'a',
  // Imagens
  'img', 'figure', 'figcaption',
  // Tabelas (crítico para e-mail marketing)
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'caption', 'col', 'colgroup',
  // Legado de e-mail (centre, font)
  'center', 'font',
];

// ── Atributos permitidos ─────────────────────────────────────────────────────
const EMAIL_ALLOWED_ATTR = [
  // Globais
  'class', 'id', 'dir', 'lang', 'title',
  // Links
  'href', 'target', 'rel',
  // Imagens
  'src', 'alt', 'width', 'height',
  // Tabelas
  'align', 'valign', 'bgcolor', 'border',
  'cellpadding', 'cellspacing', 'colspan', 'rowspan',
  'nowrap', 'scope', 'summary',
  // Legado
  'background', 'color', 'face', 'size',
  // Style inline (filtrado pelo hook)
  'style',
];

// ── Esquemas permitidos em href e src ────────────────────────────────────────
const SAFE_URI_RE = /^(https?:|mailto:|cid:|data:image\/(png|jpeg|gif|webp|svg\+xml);base64,)/i;

// ── Propriedades CSS proibidas em style inline ───────────────────────────────
const FORBIDDEN_CSS_PROPS = ['position', 'z-index', 'top', 'bottom', 'left', 'right'];

function filterStyleAttr(style: string): string {
  if (!style) return '';
  // Remover background-image com url() remota (G9)
  let out = style.replace(
    /background(-image)?\s*:[^;]*url\(['"]?https?:\/\/[^'"\)\s]+['"]?\)[^;]*/gi,
    ''
  );
  // Remover position:fixed / sticky
  out = out.replace(/position\s*:\s*(fixed|sticky)\s*[;]?/gi, '');
  // Remover propriedades de sobreposição
  FORBIDDEN_CSS_PROPS.forEach(prop => {
    out = out.replace(new RegExp(`(?:^|;)\\s*${prop}\\s*:[^;]*`, 'gi'), '');
  });
  return out.replace(/;;+/g, ';').trim();
}

// ── Registrar hooks DOMPurify (uma única vez por sessão) ─────────────────────
let hooksRegistered = false;

function ensureHooks() {
  if (hooksRegistered || typeof window === 'undefined') return;
  hooksRegistered = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;

    // Links: target + rel + validar href
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
      const href = node.getAttribute('href') || '';
      if (href && !SAFE_URI_RE.test(href)) node.removeAttribute('href');
    }

    // Imagens: bloquear src remoto (E36)
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (src && /^https?:\/\//i.test(src)) {
        // Bloquear — usuário pode liberar manualmente
        node.setAttribute('data-blocked-src', src);
        node.removeAttribute('src');
        if (!node.getAttribute('alt')) node.setAttribute('alt', '[imagem]');
      } else if (src && !SAFE_URI_RE.test(src)) {
        node.removeAttribute('src');
      }
    }

    // Style: filtrar CSS perigoso
    if (node.hasAttribute('style')) {
      const cleaned = filterStyleAttr(node.getAttribute('style') || '');
      cleaned ? node.setAttribute('style', cleaned) : node.removeAttribute('style');
    }
  });
}

// ── Cache LRU simples ────────────────────────────────────────────────────────
const MAX_CACHE_SIZE = 200;
const _cache = new Map<string, string>();

function cacheSet(key: string, value: string) {
  if (_cache.size >= MAX_CACHE_SIZE) {
    const oldest = _cache.keys().next().value;
    if (oldest) _cache.delete(oldest);
  }
  _cache.set(key, value);
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Sanitiza HTML de e-mail.
 * @param html     - HTML bruto
 * @param cacheKey - message.id (cache por mensagem)
 */
export function sanitizeEmailHtml(html: string, cacheKey: string): string {
  if (!html || html.trim() === '') return '';

  const cached = _cache.get(cacheKey);
  if (cached !== undefined) return cached;

  ensureHooks();

  const result = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
    FORCE_BODY: true,
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false,
  });

  cacheSet(cacheKey, result);
  return result;
}

/**
 * Extrai texto visível do HTML (para preview e hasMore).
 */
export function extractTextFromHtml(html: string): string {
  if (!html || typeof document === 'undefined') return '';
  const div = document.createElement('div');
  div.innerHTML = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Libera imagens bloqueadas no HTML (substituir data-blocked-src de volta em src).
 * Chamar após clique do usuário em "Mostrar imagens".
 */
export function unblockImages(container: HTMLElement) {
  container.querySelectorAll('img[data-blocked-src]').forEach((img) => {
    const src = img.getAttribute('data-blocked-src') || '';
    if (src) {
      img.setAttribute('src', src);
      img.removeAttribute('data-blocked-src');
    }
  });
}
