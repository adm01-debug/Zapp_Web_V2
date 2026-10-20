import DOMPurify from 'dompurify';

/**
 * Pipeline único de sanitização de HTML de e-mail (run h538172 + hardening audit F1-F3).
 * Usado por: EmailChatBubble, EmailThreadView (legado) e EmailFullViewDialog.
 *
 * Política:
 * - Imagens permitidas (lazy, no-referrer); data: URL > 32KB vira placeholder.
 * - Links sempre externos e seguros (target=_blank + rel=noopener noreferrer).
 * - Dimensões fixas do remetente neutralizadas (somente '%' e 'auto' permitidos;
 *   px, em, rem, vh, vw, cm, calc etc. são todos removidos); comentários CSS removidos
 *   antes do parse (F1) e QUALQUER declaração com url() descartada (F2) —
 *   cobre cursor/mask-image/list-style-image/content/filter/etc.
 * - Instância DOMPurify ISOLADA via factory (F3): removeAllHooks() chamado por
 *   qualquer outro código do bundle não desarma este pipeline.
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

/** Props de style sempre proibidas (overlay/clickjacking/exfiltração/phishing). */
const STYLE_BLOCKED_PROPS = new Set([
  'position','visibility','z-index','top','left','right','bottom','inset','transform',
  'transform-origin','translate','rotate','scale','perspective','offset','motion',
  '-webkit-transform','-webkit-mask-image','-webkit-filter','-ms-transform','-moz-transform',
  'background','background-image','list-style-image','cursor','mask-image','mask',
  '-webkit-mask','content','border-image-source','border-image','filter','image-rendering',
  'animation','transition','behavior','-moz-binding','pointer-events',
  'opacity', // previne links/texto invisíveis (phishing)
]);

type PurifyInstance = typeof DOMPurify;

/** Decodifica escapes CSS (A2-fix): "\\70 osition" → "position", "u\\72 l(" → "url(",
 *  "\\⏎" (continuação de linha) removida antes do resto. */
function cssUnescape(s: string): string {
  return s
    // continuação de linha: backslash + newline/CRLF/form-feed desaparece (CSS spec)
    .replace(/\\(\r\n|\r|\n|\f|\u2028|\u2029)/g, '')
    .replace(/\\([0-9a-fA-F]{1,6})(\r\n|[ \t\r\n\f])?/g, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      try { return cp > 0x10ffff || cp < 0 ? '' : String.fromCodePoint(cp); } catch { return ''; }
    })
    .replace(/\\(.)/g, '$1');
}

let purifier: PurifyInstance | null = null;

function installHooks(p: PurifyInstance): void {
  // Links: sempre abrir em nova aba, isolados do opener.
  // Imagens: lazy + no-referrer; data: URL gigante (base64 de MBs) vira placeholder.
  p.addHook('afterSanitizeAttributes', (node) => {
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

  // Estilos inline: remove larguras fixas do remetente (600px etc.), props hostis
  // e QUALQUER declaração contendo url() (tracker). Comentários CSS são
  // removidos ANTES do parse para não fragmentar propriedades (F1).
  p.addHook('uponSanitizeElement', (node) => {
    if (!(node instanceof Element)) return;
    const style = node.getAttribute('style');
    if (!style) return;
    const cleaned = style
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split(';')
      .filter((decl) => {
        const idx = decl.indexOf(':');
        if (idx === -1) return false; // declaração malformada/trailing ';' — descarta
        // A2-fix: prop e valor decodificados de escapes CSS ANTES das checagens —
        // "\\70 osition:fixed" e "mask:u\\72 l(...)" devem ser detectados.
        const prop = cssUnescape(decl.slice(0, idx)).trim().toLowerCase();
        const val = cssUnescape(decl.slice(idx + 1));
        if (STYLE_BLOCKED_PROPS.has(prop)) return false;
        if (/url\s*\(/i.test(val)) return false; // F2: tracker em qualquer propriedade
        if (prop === 'width' || prop === 'min-width' || prop === 'max-width' ||
            prop === 'height' || prop === 'min-height' || prop === 'max-height') {
          const v = val.trim().toLowerCase();
          // Permite somente '%' e 'auto'; qualquer outro valor (px, vh, vw, cm, …) é removido.
          return v.endsWith('%') || v === 'auto';
        }
        return true;
      })
      .join(';');
    if (cleaned.trim()) node.setAttribute('style', cleaned);
    else node.removeAttribute('style');
  });
}

/** Instância isolada (F3): terceiros que mexam na instância default não afetam aqui. */
function getPurifier(): PurifyInstance {
  if (!purifier) {
    // DOMPurify é também factory: DOMPurify(window) devolve nova instância isolada (F3).
    // Fail-closed: se a fábrica falhar não usar a instância global (vulnerável a
    // removeAllHooks() de terceiros). Ambientes SSR/edge já são barrados pelo guard
    // de addHook abaixo, que lança antes de sanitizar qualquer coisa.
    purifier = (DOMPurify as unknown as (w?: Window) => PurifyInstance)(
      typeof window !== 'undefined' ? window : undefined,
    );
    if (typeof purifier?.sanitize !== 'function') {
      throw new Error('emailHtml: instância DOMPurify isolada inválida (sem sanitize)');
    }
    // A4-fix: guard fail-closed — se a instância não aceitar hooks (SSR/edge), aborta:
    // rodar sem a política de hooks é mais perigoso do que não sanitizar.
    if (typeof purifier.addHook !== 'function') {
      throw new Error('emailHtml: ambiente sem suporte a hooks DOMPurify — sanitização indisponível');
    }
    installHooks(purifier);
  }
  return purifier;
}

/** Sanitiza HTML de e-mail com a política única do módulo. */
export function sanitizeEmailHtml(html: string): string {
  return getPurifier().sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
    FORCE_BODY: true,
    KEEP_CONTENT: true,
  });
}

/** Decodifica entities comuns sem double-decode (roda UMA vez, em texto já plano). */
function decodeEntitiesOnce(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // por último: evita re-decodar o & das entities acima
}

/** Preview textual honesto: corta em palavra, não no meio; destrincha entities. */
export function buildBodyPreview(text: string | null | undefined, maxChars = 300): string {
  if (!text) return '';
  const flat = decodeEntitiesOnce(text).replace(/\s+/g, ' ').trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}
