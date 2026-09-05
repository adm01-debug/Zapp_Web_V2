/**
 * Shared validation, security, and logging utilities for Edge Functions.
 * Provides input sanitization, rate limiting, structured logging, and standard error responses.
 */

// Re-export HMAC validation utilities
export { 
  verifyHmacSignature, 
  extractSignatureFromHeaders, 
  WebhookSecurityService, 
  createWebhookValidator 
} from './hmac-validation.ts';

// ─── Structured Logger ───────────────────────────────────────────────────────

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  fn?: string;
  requestId?: string;
  [key: string]: unknown;
}

/** Structured logger for edge functions with context and timing */
export class Logger {
  private fn: string;
  private requestId: string;
  private startTime: number;

  constructor(functionName: string) {
    this.fn = functionName;
    this.requestId = crypto.randomUUID().slice(0, 8);
    this.startTime = Date.now();
  }

  private log(level: LogLevel, message: string, ctx?: Record<string, unknown>) {
    const entry = {
      level,
      fn: this.fn,
      rid: this.requestId,
      ms: Date.now() - this.startTime,
      msg: message,
      ...ctx,
    };
    const serialized = JSON.stringify(entry);
    if (level === 'error') console.error(serialized);
    else if (level === 'warn') console.warn(serialized);
    else console.log(serialized);
  }

  debug(msg: string, ctx?: Record<string, unknown>) { this.log('debug', msg, ctx); }
  info(msg: string, ctx?: Record<string, unknown>) { this.log('info', msg, ctx); }
  warn(msg: string, ctx?: Record<string, unknown>) { this.log('warn', msg, ctx); }
  error(msg: string, ctx?: Record<string, unknown>) { this.log('error', msg, ctx); }

  /** Log final response with duration */
  done(status: number, ctx?: Record<string, unknown>) {
    this.log(status >= 400 ? 'error' : 'info', `completed ${status}`, {
      status,
      durationMs: Date.now() - this.startTime,
      ...ctx,
    });
  }
}

// Dominios exatos permitidos no CORS.
// IMPORTANTE: ao adicionar um dominio de producao novo, adicionar aqui tambem
// e redeployar todas as edges (supabase functions deploy --project-ref <ref>).
const EXACT_ALLOWED_ORIGINS = new Set([
  // Producao Vercel (projeto `zapp_web_v2` -> aliases `zappwebv2-*`; o dominio
  // principal `zapp-web-v2.vercel.app` e custom)
  'https://zapp-web-v2.vercel.app',
  'https://zappwebv2-juca1.vercel.app',
  'https://zappwebv2-git-main-juca1.vercel.app',
  // Dominios Lovable legados (manter durante transicao)
  'https://pronto-talk-suite.lovable.app',
  'https://id-preview--1d419c34-35ac-4a71-96a5-146ca1b3ebf2.lovable.app',
  'https://1d419c34-35ac-4a71-96a5-146ca1b3ebf2.lovableproject.com',
]);

const ORIGIN_PATTERNS = [
  // Previews na Vercel: zappwebv2-<hash>-juca1.vercel.app (deploy) e
  // zappwebv2-git-<branch>-juca1.vercel.app (alias de branch). Verificado na API
  // da Vercel em 2026-09-05 — o padrao antigo `zapp-web-v2-<hash>` nunca casava.
  /^https:\/\/zappwebv2-[a-z0-9-]+-juca1\.vercel\.app$/,
  // Localhost para desenvolvimento
  /^http:\/\/localhost(?::\d{1,5})?$/,
  /^http:\/\/127\.0\.0\.1(?::\d{1,5})?$/,
];

function isAllowedOrigin(origin: string): boolean {
  return EXACT_ALLOWED_ORIGINS.has(origin) ||
    ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

/** Security headers applied to all responses */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cache-Control': 'no-store',
  'Content-Security-Policy-Report-Only':
    "default-src 'none'; script-src 'none'; object-src 'none'; report-uri /csp-report",
};

/** Build CORS + security headers with origin validation */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('origin') || '';
  const allowedOrigin = isAllowedOrigin(origin) ? origin : 'https://zapp-web-v2.vercel.app';
  const requestId = req?.headers.get('x-request-id') || crypto.randomUUID();
  return {
    ...SECURITY_HEADERS,
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-app-name, x-app-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-hub-signature-256, x-signature, x-webhook-signature, x-evolution-signature, x-contract-version, x-request-id',
    'Access-Control-Expose-Headers': 'x-request-id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'X-Request-ID': requestId,
  };
}

/** @deprecated Use getCorsHeaders(req) for origin-validated CORS. Kept for backward compat — do NOT use in new code. */
export const corsHeaders = getCorsHeaders();

/** Standard JSON error response (with origin-validated CORS).
 * Em 5xx a mensagem original (frequentemente `err.message`, com nome de env
 * var, host ou stack) fica so no log do servidor; o cliente recebe texto
 * generico (CodeQL js/stack-trace-exposure). 4xx segue como esta: e a
 * mensagem de validacao que o front exibe. */
export function errorResponse(message: string, status = 400, req?: Request) {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  let body = message;
  if (status >= 500) {
    console.error(JSON.stringify({ level: 'error', source: 'edge', status, msg: message }));
    body = 'Internal server error';
  }
  return new Response(
    JSON.stringify({ error: body }),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}

/** Standard JSON success response (with origin-validated CORS) */
export function jsonResponse(data: unknown, status = 200, req?: Request) {
  const headers = req ? getCorsHeaders(req) : corsHeaders;
  return new Response(
    JSON.stringify(data),
    { status, headers: { ...headers, 'Content-Type': 'application/json' } }
  );
}

/** Handle CORS preflight with origin validation */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}

/** Sanitize string input — strip control chars, trim, enforce max length */
export function sanitizeString(input: unknown, maxLength = 10000): string | null {
  if (typeof input !== 'string') return null;
  // Remove control characters except newlines/tabs
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  return cleaned.length > 0 ? cleaned.slice(0, maxLength) : null;
}

/** Validate UUID format */
export function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** In-memory rate limiter (per-isolate, resets on cold start) with auto-cleanup */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return; // Cleanup at most once per minute
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  maxRequests = 30,
  windowMs = 60_000
): { allowed: boolean; remaining: number } {
  cleanupRateLimitMap();
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  entry.count++;
  const remaining = Math.max(0, maxRequests - entry.count);
  return { allowed: entry.count <= maxRequests, remaining };
}

// Cliente service_role compartilhado pelo isolate (so para o limiter persistente).
interface RateLimitRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}
let serviceClientPromise: Promise<RateLimitRpcClient> | null = null;
function getServiceClient(): Promise<RateLimitRpcClient> {
  if (!serviceClientPromise) {
    serviceClientPromise = import("https://esm.sh/@supabase/supabase-js@2.87.1").then(({ createClient }) =>
      createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
        auth: { persistSession: false },
      })
    ).catch((err) => {
      serviceClientPromise = null;
      throw err;
    });
  }
  return serviceClientPromise;
}

/**
 * Rate limit persistente (tabela edge_rate_limits + RPC consume_rate_limit,
 * migration 20260905020000). O contador em memoria de checkRateLimit e so um
 * pre-filtro: ele nao sobrevive a cold start nem e compartilhado entre
 * isolates. Se o banco falhar, cai para o contador local (fail-open com log)
 * em vez de derrubar a funcao.
 */
export async function enforceRateLimit(
  key: string,
  maxRequests = 30,
  windowMs = 60_000
): Promise<{ allowed: boolean; remaining: number; persistent: boolean }> {
  const local = checkRateLimit(key, maxRequests, windowMs);
  if (!local.allowed) return { ...local, persistent: false };
  try {
    const client = await getServiceClient();
    const { data, error } = await client.rpc("consume_rate_limit", {
      p_key: key,
      p_max: maxRequests,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000)),
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: unknown; remaining?: unknown } | null;
    if (!row || typeof row.allowed !== "boolean") return { ...local, persistent: false };
    return {
      allowed: row.allowed,
      remaining: typeof row.remaining === "number" ? row.remaining : 0,
      persistent: true,
    };
  } catch (err) {
    console.warn("[rate-limit] limiter persistente indisponivel; usando contador local:", String(err));
    return { ...local, persistent: false };
  }
}

/** Extract client IP from request for rate limiting.
 * Uses the RIGHTMOST XFF value (set by the trusted Supabase edge proxy) to
 * prevent attackers from spoofing the IP by prepending fake XFF entries. */
export function getClientIP(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',');
    const rightmost = parts[parts.length - 1]?.trim();
    if (rightmost) return rightmost;
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

/** Get required env var or throw */
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

/**
 * Require a valid Supabase JWT in the Authorization header.
 * Returns the authenticated user id, or a Response (401) to short-circuit.
 */
export async function requireAuth(req: Request): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return errorResponse("Missing Authorization bearer token", 401, req);
  }
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.87.1");
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) {
      return errorResponse("Invalid or expired token", 401, req);
    }
    return { userId: data.user.id };
  } catch (_err) {
    return errorResponse("Authentication failed", 401, req);
  }
}
