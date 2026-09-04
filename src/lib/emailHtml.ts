import DOMPurify from 'dompurify';

/**
 * Pipeline único de sanitização de HTML de e-mail (run h538172).
 * Usado por: EmailChatBubble, EmailThreadView (legado) e EmailFullViewDialog.
 *
 * Política:
 * - Imagens permitidas (lazy, no-referrer) — antes eram removidas silenciosamente.
 * - Links sempre externos e seguros (target=_blank + rel=noopener noreferrer).
 * - Larguras fixas de remetente (width/min-width px em style) são neutralizadas
 *   para o container conter o layout (ver .email-html-body no components.css).
 * - <style> e <script> continuam proibidos (allowlist).
 */

const EMAIL_ALLOWED_TAGS = [
  'p','br','strong','em','b','i','u','s','a','ul','ol','li','blockquote',
  'span','div','table','thead','tbody','tfoot','tr','td','th','caption','colgroup','col',
  'h1','h2','h3','h4','h5','h6','img','hr','pre','code','sub','sup','font','center',
];

const EMAIL_ALLOWED_ATTR = [
  'href','target','rel','title','alt','src','width','height',
  'colspan','rowspan','align','valign','bgcolor','color','style','loading',
];

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  // Links: sempre abrir em nova aba, isolados do opener.
  // Imagens: lazy + no-referrer; data: URL gigante (base64 de MBs) vira placeholder.
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('referrerpolicy', 'no-referrer');
      const src = node.getAttribute('src') || '';
      if (src.startsWith('data:') && src.length > 32768) {
        node.removeAttribute('src');
        node.setAttribute('alt', node.getAttribute('alt') || '[imagem incorporada muito grande — ver e-mail completo]');
      }
    }
  });

  // Estilos inline: remove larguras fixas do remetente (600px etc.) que estouram
  // o bubble/chat; remove também propriedades hostis (clickjacking/exfiltração):
  // position/visibility/z-index (overlay) e background-image com url() (tracker).
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName !== 'table' && data.tagName !== 'td' && data.tagName !== 'th'
      && data.tagName !== 'div' && data.tagName !== 'img' && data.tagName !== 'span'
      && data.tagName !== 'p' && data.tagName !== 'a' && data.tagName !== 'td') return;
    if (!(node instanceof Element)) return;
    const style = node.getAttribute('style');
    if (!style) return;
    const cleaned = style
      .split(';')
      .filter((decl) => {
        const prop = decl.slice(0, decl.indexOf(':')).trim().toLowerCase();
        if (['position', 'visibility', 'z-index', 'top', 'left', 'right', 'bottom', 'background-image', 'background'].includes(prop)) {
          return false;
        }
        if (prop === 'width' || prop === 'min-width' || prop === 'max-width') {
          const val = decl.slice(decl.indexOf(':') + 1).trim().toLowerCase();
          // Mantém larguras proporcionais (%, auto); remove px/cm fixos.
          return val.endsWith('%') || val === 'auto';
        }
        return true;
      })
      .join(';');
    if (cleaned.trim()) node.setAttribute('style', cleaned);
    else node.removeAttribute('style');
  });
}

/** Remove declarações de largura fixa do atributo style (px/em/cm). */
export function sanitizeEmailHtml(html: string): string {
  installHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
    FORCE_BODY: true,
    // Estilos de e-mail usam attr width/height legado — deixa passar; o CSS
    // de contenção (.email-html-body) refina a apresentação.
    KEEP_CONTENT: true,
  });
}

/** Preview textual honesto: corta em palavra, não no meio; destrincha entities. */
export function buildBodyPreview(text: string | null | undefined, maxChars = 300): string {
  if (!text) return '';
  const decoded = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const flat = decoded.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
