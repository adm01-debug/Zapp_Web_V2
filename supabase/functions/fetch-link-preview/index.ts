import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface PreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

const MAX_BYTES = 512 * 1024; // 512KB cap
const FETCH_TIMEOUT_MS = 6000;

// In-memory LRU-ish cache by URL hash. Persists while the isolate is warm.
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6h for hits
const NEG_CACHE_TTL_MS = 1000 * 60 * 15; // 15min for misses/errors
const CACHE_MAX = 500;
const previewCache = new Map<string, { expiresAt: number; preview: PreviewData | null }>();

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

async function dbCacheGet(key: string): Promise<{ hit: boolean; preview: PreviewData | null }> {
  if (!db) return { hit: false, preview: null };
  const { data, error } = await db
    .from('link_preview_cache')
    .select('preview, expires_at')
    .eq('url_hash', key)
    .maybeSingle();
  if (error || !data) return { hit: false, preview: null };
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    return { hit: false, preview: null };
  }
  return { hit: true, preview: (data.preview as PreviewData | null) ?? null };
}

async function dbCacheSet(key: string, url: string, preview: PreviewData | null): Promise<void> {
  if (!db) return;
  const ttl = preview ? CACHE_TTL_MS : NEG_CACHE_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  await db
    .from('link_preview_cache')
    .upsert(
      { url_hash: key, url, preview, expires_at: expiresAt },
      { onConflict: 'url_hash' },
    );
}

async function hashUrl(raw: string): Promise<string> {
  const buf = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function cacheGet(key: string): { hit: boolean; preview: PreviewData | null } {
  const entry = previewCache.get(key);
  if (!entry) return { hit: false, preview: null };
  if (entry.expiresAt < Date.now()) {
    previewCache.delete(key);
    return { hit: false, preview: null };
  }
  // refresh LRU position
  previewCache.delete(key);
  previewCache.set(key, entry);
  return { hit: true, preview: entry.preview };
}

function cacheSet(key: string, preview: PreviewData | null): void {
  if (previewCache.size >= CACHE_MAX) {
    const oldest = previewCache.keys().next().value;
    if (oldest) previewCache.delete(oldest);
  }
  previewCache.set(key, {
    expiresAt: Date.now() + (preview ? CACHE_TTL_MS : NEG_CACHE_TTL_MS),
    preview,
  });
}

function isPublicHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.toLowerCase();
    // Block obvious SSRF targets
    if (
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return u;
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractMeta(html: string, names: string[]): string | undefined {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      'i',
    );
    const alt = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
      'i',
    );
    const m = html.match(re) || html.match(alt);
    if (m?.[1]) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1]).trim() : undefined;
}

function absolutize(maybeUrl: string | undefined, base: URL): string | undefined {
  if (!maybeUrl) return undefined;
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return undefined;
  }
}

async function fetchPreview(rawUrl: string): Promise<PreviewData | null> {
  const url = isPublicHttpUrl(rawUrl);
  if (!url) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ZAPPLinkPreview/1.0; +https://zapp.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch {
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);

  if (!resp.ok || !resp.body) return null;
  const ct = resp.headers.get('content-type') || '';
  if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null;

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try { await reader.cancel(); } catch { /* noop */ }
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);

  const title =
    extractMeta(html, ['og:title', 'twitter:title']) || extractTitle(html);
  const description = extractMeta(html, [
    'og:description',
    'twitter:description',
    'description',
  ]);
  const image = absolutize(
    extractMeta(html, ['og:image', 'og:image:url', 'twitter:image']),
    url,
  );
  const siteName = extractMeta(html, ['og:site_name', 'application-name']);

  if (!title && !description && !image) return null;

  return {
    url: url.toString(),
    title,
    description,
    image,
    siteName,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === 'string' ? body.url : '';
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'Missing "url" string in body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const key = await hashUrl(url);
    const cached = cacheGet(key);
    if (cached.hit) {
      return new Response(JSON.stringify({ preview: cached.preview, cached: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const dbCached = await dbCacheGet(key);
    if (dbCached.hit) {
      cacheSet(key, dbCached.preview);
      return new Response(
        JSON.stringify({ preview: dbCached.preview, cached: true, source: 'db' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const preview = await fetchPreview(url);
    cacheSet(key, preview);
    await dbCacheSet(key, url, preview);
    return new Response(JSON.stringify({ preview, cached: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'unexpected_error', message: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});