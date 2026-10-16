// URL regex pattern
export const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/gi;

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov'];

/**
 * Caminho do URL, sem query nem fragmento. A extensão só vale no CAMINHO:
 * `https://x.com/p?f=.png` não é uma imagem (o `includes` antigo aceitava).
 */
function urlPath(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.split(/[?#]/)[0].toLowerCase();
  }
}

export function isImageUrl(url: string): boolean {
  const path = urlPath(url);
  return IMAGE_EXTENSIONS.some(ext => path.endsWith(ext));
}

export function isVideoUrl(url: string): boolean {
  const path = urlPath(url);
  return VIDEO_EXTENSIONS.some(ext => path.endsWith(ext));
}

export function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com/watch') || url.includes('youtu.be/');
}

export function getYouTubeThumbnail(url: string): string | null {
  let videoId: string | null = null;
  if (url.includes('youtube.com/watch')) {
    const urlParams = new URLSearchParams(url.split('?')[1]);
    videoId = urlParams.get('v');
  } else if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1]?.split('?')[0] ?? null;
  }
  return videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
}

export function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

/**
 * Hosts de onde a prévia pode carregar `<img>` no navegador do atendente.
 * Espelha a lista `FAVICON_SAFE_DOMAINS` da V3: fora daqui a imagem/favicon
 * não vira requisição (o host é escolhido pelo remetente da mensagem e
 * receber a requisição expõe IP, user-agent e hora de leitura). A prévia cai
 * no ícone genérico + domínio.
 */
const FAVICON_SAFE_DOMAINS = [
  'googleusercontent.com',
  'lh3.googleusercontent.com',
  'whatsapp.net',
  'img.youtube.com',
  'i.ytimg.com',
  'www.youtube.com',
  'youtube.com',
];

/**
 * `true` quando o navegador do atendente pode buscar a mídia deste URL:
 * `data:`/`blob:` (não saem da máquina), a própria origem do app, ou um host
 * da lista permitida. Qualquer outra coisa devolve `false`.
 */
export function isAllowedMediaHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') return true;
  if (typeof window !== 'undefined' && parsed.origin === window.location.origin) return true;
  const hostname = parsed.hostname.toLowerCase();
  return FAVICON_SAFE_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain));
}

export function getFavicon(url: string): string {
  try {
    const faviconUrl = `${new URL(url).origin}/favicon.ico`;
    return isAllowedMediaHost(faviconUrl) ? faviconUrl : '';
  } catch {
    return '';
  }
}

export function extractLinks(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/** Escapes HTML entities to prevent XSS when using dangerouslySetInnerHTML */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  type?: 'website' | 'image' | 'video' | 'article';
  favicon?: string;
}
