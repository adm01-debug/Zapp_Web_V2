// deno-lint-ignore-file no-explicit-any
// Shared validation, rate limiting and security utilities for Edge Functions
// SECURITY: centralizes input validation and rate limiting to prevent abuse

/** Simple in-memory rate limiter (per isolate). For distributed limiting use rate_limit_log table. */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  /** unique key, e.g. `send-text:${ip}` */
  key: string;
  /** max requests per window */
  limit: number;
  /** window size in ms */
  windowMs: number;
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count++;
  return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

/** Periodic cleanup to avoid unbounded memory growth */
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) {
    if (now >= v.resetAt) rateBuckets.delete(k);
  }
}, 60_000);

/** Extract best-effort client IP from request headers */
export function getClientIP(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

/** Structured logger with levels; avoids leaking secrets */
export class Logger {
  constructor(private context: string) {}
  private fmt(level: string, msg: string, extra?: unknown) {
    const base = `[${new Date().toISOString()}] [${level}] [${this.context}] ${msg}`;
    return extra !== undefined ? `${base} ${JSON.stringify(extra)}` : base;
  }
  info(msg: string, extra?: unknown) { console.log(this.fmt('INFO', msg, extra)); }
  warn(msg: string, extra?: unknown) { console.warn(this.fmt('WARN', msg, extra)); }
  error(msg: string, extra?: unknown) { console.error(this.fmt('ERROR', msg, extra)); }
}

/** Validate string field: required, max length, optional pattern */
export function validateString(value: unknown, field: string, opts: { required?: boolean; maxLen?: number; pattern?: RegExp } = {}): string | null {
  const { required = true, maxLen = 10_000, pattern } = opts;
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`Campo obrigatorio: ${field}`);
    return null;
  }
  if (typeof value !== 'string') throw new Error(`Campo ${field} deve ser string`);
  if (value.length > maxLen) throw new Error(`Campo ${field} excede ${maxLen} caracteres`);
  if (pattern && !pattern.test(value)) throw new Error(`Campo ${field} com formato invalido`);
  return value;
}

/** Validate phone number in E.164-ish / WhatsApp JID formats */
export function validatePhone(value: unknown, field = 'phone'): string {
  const v = validateString(value, field, { maxLen: 64 });
  if (!v) throw new Error(`Campo obrigatorio: ${field}`);
  if (!/^[0-9@.\-+_:a-zA-Z]+$/.test(v)) throw new Error(`Campo ${field} com formato invalido`);
  return v;
}

/** Allowed origins for browser calls (production + previews + local dev) */
const ALLOWED_ORIGINS = [
  'https://zapp-web-v2.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:3000',
];
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/zapp-web-v2-[a-z0-9-]+-adm01s-projects\.vercel\.app$/,
  /^https:\/\/[a-z0-9-]+\.lovableproject\.com$/,
  /^https:\/\/[a-z0-9-]+\.lovable\.app$/,
];

export function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

/** Security headers applied to every response */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cache-Control': 'no-store',
};

/** Build CORS + security headers with origin validation */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = isAllowedOrigin(origin) ? origin : 'https://zapp-web-v2.vercel.app';
  return {
    ...SECURITY_HEADERS,
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-app-name, x-app-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-hub-signature-256, x-signature, x-webhook-signature, x-evolution-signature',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** @deprecated Use getCorsHeaders(req) for origin-validated CORS. Kept for backward compat — do NOT use in new code. */
export const corsHeaders = getCorsHeaders();

/** Standard JSON error response (with origin-validated CORS) */
export function errorResponse(message: string, status = 400, req?: Request) {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}

/** Handle CORS preflight; returns Response for OPTIONS, null otherwise */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }
  return null;
}
