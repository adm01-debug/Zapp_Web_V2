/**
 * HMAC Webhook Signature Validation
 * 
 * Provides secure validation of webhook payloads using HMAC-SHA256.
 * Uses Web Crypto API for cryptographic operations and implements
 * constant-time comparison to prevent timing attacks.
 */

/**
 * Validates HMAC-SHA256 signature of a webhook payload.
 * 
 * @param payload - Raw request body as string
 * @param signature - Signature from webhook header (hex-encoded or with 'sha256=' prefix)
 * @param secret - Shared secret key
 * @returns true if signature is valid
 */
export async function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  if (!payload || !signature || !secret) {
    return false;
  }

  try {
    // Remove 'sha256=' prefix if present (common in GitHub-style webhooks)
    const normalizedSignature = signature.toLowerCase().replace(/^sha256=/, '');

    // Convert secret to key
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Compute expected signature
    const payloadBytes = encoder.encode(payload);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadBytes);
    
    // Convert to hex string
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Constant-time comparison
    return timingSafeEqual(expectedSignature, normalizedSignature);
  } catch (error) {
    console.error('[HMAC] Signature verification error:', error);
    return false;
  }
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Compares strings in constant time regardless of where they differ.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a full comparison to maintain constant time
    let dummy = 0;
    for (let i = 0; i < a.length; i++) {
      dummy |= a.charCodeAt(i) ^ (b.charCodeAt(i % b.length) || 0);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Extracts signature from request headers.
 * Supports multiple common header formats.
 */
export function extractSignatureFromHeaders(headers: Headers): string | null {
  // Try common webhook signature headers in order of precedence
  const signatureHeaders = [
    'x-hub-signature-256',    // GitHub-style
    'x-signature',            // Generic
    'x-webhook-signature',    // Alternative
    'x-evolution-signature',  // Evolution API specific
    'x-api-signature',        // API Gateway style
  ];

  for (const header of signatureHeaders) {
    const value = headers.get(header);
    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * WebhookSecurityService - Comprehensive webhook security validation.
 * 
 * Usage:
 * ```typescript
 * const security = new WebhookSecurityService('my-secret');
 * const validation = await security.validateRequest(req);
 * if (!validation.valid) {
 *   return new Response('Unauthorized', { status: 401 });
 * }
 * const payload = validation.payload;
 * ```
 */
export class WebhookSecurityService {
  private secret: string;
  private strictMode: boolean;

  /**
   * @param secret - HMAC secret for signature validation
   * @param strictMode - If true, rejects requests without signatures. Default: false
   */
  constructor(secret: string, strictMode = false) {
    this.secret = secret;
    this.strictMode = strictMode;
  }

  /**
   * Validates webhook request signature and returns parsed payload.
   */
  async validateRequest(req: Request): Promise<{
    valid: boolean;
    payload: string | null;
    error?: string;
    signatureFound: boolean;
    signatureValid: boolean;
  }> {
    const signature = extractSignatureFromHeaders(req.headers);
    const signatureFound = signature !== null;

    // Read body
    let payload: string;
    try {
      payload = await req.text();
    } catch (error) {
      return {
        valid: false,
        payload: null,
        error: 'Failed to read request body',
        signatureFound,
        signatureValid: false,
      };
    }

    // If no signature and strict mode, reject
    if (!signatureFound && this.strictMode) {
      console.warn('[HMAC] Strict mode: rejecting request without signature');
      return {
        valid: false,
        payload,
        error: 'Missing webhook signature',
        signatureFound: false,
        signatureValid: false,
      };
    }

    // If no signature and not strict mode, allow (for backwards compatibility)
    if (!signatureFound) {
      console.info('[HMAC] No signature found, allowing request (non-strict mode)');
      return {
        valid: true,
        payload,
        signatureFound: false,
        signatureValid: false,
      };
    }

    // Validate signature
    const signatureValid = await verifyHmacSignature(payload, signature, this.secret);

    if (!signatureValid) {
      console.warn('[HMAC] Invalid signature received');
      return {
        valid: false,
        payload,
        error: 'Invalid webhook signature',
        signatureFound: true,
        signatureValid: false,
      };
    }

    console.info('[HMAC] Signature validated successfully');
    return {
      valid: true,
      payload,
      signatureFound: true,
      signatureValid: true,
    };
  }

  /**
   * Creates a signature for a payload (useful for testing or outgoing webhooks).
   */
  async signPayload(payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.secret);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const payloadBytes = encoder.encode(payload);
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadBytes);
    
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return `sha256=${signature}`;
  }
}

/**
 * Creates a webhook security middleware for Deno serve handlers.
 * 
 * Usage:
 * ```typescript
 * const validateWebhook = createWebhookValidator(Deno.env.get('WEBHOOK_SECRET')!);
 * 
 * serve(async (req) => {
 *   const validation = await validateWebhook(req);
 *   if (!validation.valid) {
 *     return new Response(validation.error, { status: 401 });
 *   }
 *   const payload = JSON.parse(validation.payload!);
 *   // ... handle webhook
 * });
 * ```
 */
export function createWebhookValidator(secret: string, strictMode = false) {
  const service = new WebhookSecurityService(secret, strictMode);
  return (req: Request) => service.validateRequest(req);
}

/**
 * ---------------------------------------------------------------------------
 * Webhook auth SHADOW MODE helpers
 * ---------------------------------------------------------------------------
 * Introduced to observe, via production logs, whether webhook-signature
 * secrets are correctly configured on both sides (Supabase Secrets + the
 * external provider) BEFORE a future PR flips these checks to enforcement
 * (401 on invalid/missing signature).
 *
 * CONTRACT: none of these helpers ever throw, and their return value must
 * NEVER be used to gate/short-circuit the HTTP response. They only validate
 * + log with the `[WEBHOOK_AUTH_SHADOW]` marker so ops can grep logs later.
 */

export interface WebhookAuthShadowResult {
  signaturePresent: boolean;
  signatureValid: boolean;
  reason: 'missing_signature' | 'missing_secret' | 'valid' | 'invalid_signature';
}

/**
 * Shadow-validates a simple HMAC-SHA256-over-raw-body signature (formats
 * `sha256=<hex>` or bare `<hex>`), found via `extractSignatureFromHeaders`.
 * Suitable for providers that sign the whole payload directly (Evolution
 * API's `x-evolution-signature`, Meta/WhatsApp Cloud's `x-hub-signature-256`).
 *
 * Never blocks — logs the outcome and returns it for callers that want to
 * inspect it (e.g. tests), but the boolean MUST NOT gate the response.
 */
export async function logWebhookAuthShadow(
  handlerName: string,
  headers: Headers,
  payload: string,
  secret: string | undefined | null,
  expectedHeader?: string,
): Promise<WebhookAuthShadowResult> {
  // Sem expectedHeader, extractSignatureFromHeaders escolhe pela ordem de
  // precedencia generica e pode validar o header de outro provedor, produzindo
  // resultado sombra falso. Handlers que sabem seu header passam ele aqui.
  const signature = expectedHeader
    ? headers.get(expectedHeader)
    : extractSignatureFromHeaders(headers);

  if (!signature) {
    console.warn(`[WEBHOOK_AUTH_SHADOW] ${handlerName}: assinatura ausente/invalida — modo sombra, requisicao processada mesmo assim`);
    return { signaturePresent: false, signatureValid: false, reason: 'missing_signature' };
  }

  if (!secret) {
    console.warn(`[WEBHOOK_AUTH_SHADOW] ${handlerName}: assinatura presente mas secret nao configurado no ambiente — modo sombra, requisicao processada mesmo assim`);
    return { signaturePresent: true, signatureValid: false, reason: 'missing_secret' };
  }

  const valid = await verifyHmacSignature(payload, signature, secret);
  if (!valid) {
    console.warn(`[WEBHOOK_AUTH_SHADOW] ${handlerName}: assinatura presente mas invalida — modo sombra, requisicao processada mesmo assim`);
    return { signaturePresent: true, signatureValid: false, reason: 'invalid_signature' };
  }

  // Fica em warn porque o eslint do repo so permite console.warn/error em
  // edge functions; o marcador ':' assinatura valida' ja separa este caso dos
  // ramos de anomalia num grep.
  console.warn(`[WEBHOOK_AUTH_SHADOW] ${handlerName}: assinatura valida`);
  return { signaturePresent: true, signatureValid: true, reason: 'valid' };
}

/**
 * Shadow-validates ElevenLabs' `ElevenLabs-Signature` header (format
 * `t=<unix_seconds>,v0=<hmac_sha256_hex>`, HMAC computed over
 * `${t}.${payload}` per ElevenLabs' documented HMAC scheme). Falls back to
 * a legacy `xi-signature` header name in case older tooling/docs used it.
 *
 * Never blocks — shadow mode only.
 */
export async function logElevenLabsAuthShadow(
  headers: Headers,
  payload: string,
  secret: string | undefined | null,
): Promise<WebhookAuthShadowResult> {
  const signatureHeader = headers.get('elevenlabs-signature') || headers.get('xi-signature');

  if (!signatureHeader) {
    console.warn('[WEBHOOK_AUTH_SHADOW] elevenlabs-webhook: assinatura ausente/invalida — modo sombra, requisicao processada mesmo assim');
    return { signaturePresent: false, signatureValid: false, reason: 'missing_signature' };
  }

  if (!secret) {
    console.warn('[WEBHOOK_AUTH_SHADOW] elevenlabs-webhook: assinatura presente mas secret nao configurado no ambiente — modo sombra, requisicao processada mesmo assim');
    return { signaturePresent: true, signatureValid: false, reason: 'missing_secret' };
  }

  try {
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(',')) {
      const eqIndex = part.indexOf('=');
      if (eqIndex === -1) continue;
      parts[part.slice(0, eqIndex).trim()] = part.slice(eqIndex + 1).trim();
    }
    const timestamp = parts['t'];
    const v0 = parts['v0'];

    if (!timestamp || !v0) {
      console.warn('[WEBHOOK_AUTH_SHADOW] elevenlabs-webhook: assinatura ausente/invalida — formato inesperado (esperado t=...,v0=...), modo sombra, requisicao processada mesmo assim');
      return { signaturePresent: true, signatureValid: false, reason: 'invalid_signature' };
    }

    const valid = await verifyHmacSignature(`${timestamp}.${payload}`, v0, secret);
    if (!valid) {
      console.warn('[WEBHOOK_AUTH_SHADOW] elevenlabs-webhook: assinatura presente mas invalida — modo sombra, requisicao processada mesmo assim');
      return { signaturePresent: true, signatureValid: false, reason: 'invalid_signature' };
    }

    console.warn('[WEBHOOK_AUTH_SHADOW] elevenlabs-webhook: assinatura valida');
    return { signaturePresent: true, signatureValid: true, reason: 'valid' };
  } catch (error) {
    console.warn('[WEBHOOK_AUTH_SHADOW] elevenlabs-webhook: erro ao processar assinatura — modo sombra, requisicao processada mesmo assim', error);
    return { signaturePresent: true, signatureValid: false, reason: 'invalid_signature' };
  }
}

/**
 * Decodes (WITHOUT cryptographically verifying) a Google Pub/Sub OIDC bearer
 * token from the `Authorization` header and logs presence + `aud`/`iss`
 * claims for shadow observation.
 *
 * LIMITATION: this does NOT verify the JWT signature against Google's
 * public keys (JWKS), nor does it validate audience/issuer against expected
 * values. Full OIDC verification is a follow-up iteration — see the PR body
 * for details. This is intentionally log-only for the shadow-mode rollout.
 *
 * Never blocks — shadow mode only.
 */
/**
 * gmail-webhook e publico e este token nao passou por verificacao de
 * assinatura: qualquer um pode escolher aud/iss. Sem sanitizar, um CR/LF no
 * claim forja linhas `[WEBHOOK_AUTH_SHADOW]` inteiras no log.
 */
function sanitizeClaimForLog(value: unknown): string {
  if (typeof value !== 'string') return value === undefined ? '(ausente)' : '(invalido)';
  const flat = Array.from(value, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f ? ' ' : ch;
  }).join('');
  return flat.length > 200 ? `${flat.slice(0, 200)}…(truncado)` : flat;
}

export function logGmailOidcAuthShadow(headers: Headers): void {
  const authHeader = headers.get('authorization');

  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    console.warn('[WEBHOOK_AUTH_SHADOW] gmail-webhook: assinatura ausente/invalida — header Authorization Bearer (OIDC) ausente, modo sombra, requisicao processada mesmo assim');
    return;
  }

  const token = authHeader.slice(authHeader.indexOf(' ') + 1).trim();
  const segments = token.split('.');
  if (segments.length !== 3) {
    console.warn('[WEBHOOK_AUTH_SHADOW] gmail-webhook: assinatura ausente/invalida — token OIDC malformado (nao e um JWT valido), modo sombra, requisicao processada mesmo assim');
    return;
  }

  try {
    const claims = JSON.parse(decodeJwtSegment(segments[1])) as { aud?: string; iss?: string };
    console.warn(
      `[WEBHOOK_AUTH_SHADOW] gmail-webhook: token OIDC presente (assinatura NAO verificada nesta etapa — ver limitacao no PR) aud=${sanitizeClaimForLog(claims.aud)} iss=${sanitizeClaimForLog(claims.iss)}`
    );
  } catch (error) {
    console.warn('[WEBHOOK_AUTH_SHADOW] gmail-webhook: assinatura ausente/invalida — falha ao decodificar payload do JWT, modo sombra, requisicao processada mesmo assim', error);
  }
}

function decodeJwtSegment(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function decodeJwtSegmentBytes(segment: string): Uint8Array<ArrayBuffer> {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * ---------------------------------------------------------------------------
 * Verificação BLOQUEANTE de autenticidade (R2-API-021)
 * ---------------------------------------------------------------------------
 * Ao contrário dos helpers [WEBHOOK_AUTH_SHADOW] acima — que por contrato nunca
 * bloqueiam — o veredito destas funções DECIDE a resposta: quem chama rejeita
 * com 401 quando `ok` não é true, antes de qualquer efeito (banco/provedor).
 * Todas falham fechado: sem a credencial esperada configurada (secret, JWKS,
 * audience), a requisição é recusada, nunca processada.
 */

export type WebhookAuthFailureReason =
  | 'missing_secret'
  | 'missing_audience'
  | 'missing_signature'
  | 'malformed_signature'
  | 'invalid_signature'
  | 'malformed_token'
  | 'jwks_unavailable'
  | 'unknown_kid'
  | 'bad_issuer'
  | 'bad_audience'
  | 'token_expired'
  | 'bad_email';

export type WebhookAuthVerdict =
  | { ok: true; reason: 'valid'; email?: string }
  | { ok: false; reason: WebhookAuthFailureReason };

/**
 * Verificação bloqueante do `x-hub-signature-256` da Meta/WhatsApp Cloud:
 * HMAC-SHA256 hex do corpo cru com WHATSAPP_APP_SECRET. Sem timestamp no
 * esquema da Meta — o vínculo com o corpo é o que impede replay/adulteração.
 */
export async function verifyMetaWebhookSignature(
  headers: Headers,
  payload: string,
  secret: string | undefined | null,
): Promise<WebhookAuthVerdict> {
  if (!secret) return { ok: false, reason: 'missing_secret' };

  const header = headers.get('x-hub-signature-256');
  if (!header) return { ok: false, reason: 'missing_signature' };

  if (!/^sha256=[0-9a-f]{64}$/i.test(header.trim())) {
    return { ok: false, reason: 'malformed_signature' };
  }

  const valid = await verifyHmacSignature(payload, header.trim(), secret);
  return valid
    ? { ok: true, reason: 'valid' }
    : { ok: false, reason: 'invalid_signature' };
}

/**
 * ---------------------------------------------------------------------------
 * OIDC do Google Pub/Sub (push) — verificação REAL do JWT RS256
 * ---------------------------------------------------------------------------
 * O push do Pub/Sub pode ser configurado com um token OIDC (service account).
 * O token chega em `Authorization: Bearer <jwt>`; a assinatura é verificada
 * contra o JWKS público do Google e os claims conferem issuer, audience
 * (configurada na subscription), janela de validade e identidade do emissor.
 */

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_OIDC_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const OIDC_LEEWAY_SECONDS = 60;
const JWKS_CACHE_TTL_MS = 15 * 60 * 1000;

type GoogleJwk = JsonWebKey & { kid?: string };

const googleJwksCache = new Map<string, { keys: GoogleJwk[]; expiresAt: number }>();

async function fetchGoogleJwks(
  jwksUrl: string,
  fetcher: typeof fetch,
  forceRefresh = false,
): Promise<GoogleJwk[] | null> {
  const cached = googleJwksCache.get(jwksUrl);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.keys;

  try {
    const res = await fetcher(jwksUrl);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const keys = (body as { keys?: unknown })?.keys;
    if (!Array.isArray(keys)) return null;
    googleJwksCache.set(jwksUrl, { keys: keys as GoogleJwk[], expiresAt: Date.now() + JWKS_CACHE_TTL_MS });
    return keys as GoogleJwk[];
  } catch {
    return null;
  }
}

export interface GoogleOidcVerifyOptions {
  /**
   * `aud` esperado — a audience configurada na push subscription do Pub/Sub
   * (em geral a URL pública do endpoint). Obrigatório: sem ele a verificação
   * falha fechada.
   */
  audience: string | undefined | null;
  /**
   * `email` exato do service account emissor (claim `email` do token).
   * Obrigatório: sem ele a verificação falha fechada (`missing_secret`) —
   * um JWT Google válido com `aud` correta NÃO prova a origem, porque
   * qualquer service account de qualquer projeto GCP emite token com
   * audience arbitrária (a audience é a URL pública, conhecida).
   */
  expectedEmail?: string | null;
  /** URL do JWKS — padrão: endpoint oficial do Google. */
  jwksUrl?: string;
  /** fetch injetável para teste. */
  fetcher?: typeof fetch;
  /** relógio injetável para teste. */
  nowMs?: number;
}

/**
 * Verifica um JWT OIDC do Google (Pub/Sub push): assinatura RS256 contra o
 * JWKS, `iss` Google, `aud` exata, `exp`/`iat` dentro da janela (anti-replay)
 * e identidade do emissor (`email`/`email_verified`).
 */
export async function verifyGoogleOidcToken(
  token: string,
  options: GoogleOidcVerifyOptions,
): Promise<WebhookAuthVerdict> {
  const audience = options.audience || '';
  if (!audience) return { ok: false, reason: 'missing_audience' };

  const expectedEmail = options.expectedEmail || '';
  if (!expectedEmail) return { ok: false, reason: 'missing_secret' };

  const segments = token.split('.');
  if (segments.length !== 3) return { ok: false, reason: 'malformed_token' };

  let header: { alg?: string; kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(decodeJwtSegment(segments[0]));
    claims = JSON.parse(decodeJwtSegment(segments[1]));
  } catch {
    return { ok: false, reason: 'malformed_token' };
  }
  // Só RS256 — qualquer outro alg (incl. "none") é recusado antes de verificar.
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    return { ok: false, reason: 'malformed_token' };
  }

  const jwksUrl = options.jwksUrl || GOOGLE_JWKS_URL;
  const fetcher = options.fetcher ?? fetch;

  let keys = await fetchGoogleJwks(jwksUrl, fetcher);
  if (keys === null) return { ok: false, reason: 'jwks_unavailable' };
  let jwk = keys.find((k) => k.kid === header.kid && (k.kty === 'RSA' || k.kty === undefined));
  if (!jwk) {
    // O Google rotaciona as chaves: um kid desconhecido ganha uma segunda
    // chance fora do cache antes de ser recusado.
    keys = await fetchGoogleJwks(jwksUrl, fetcher, true);
    if (keys === null) return { ok: false, reason: 'jwks_unavailable' };
    jwk = keys.find((k) => k.kid === header.kid && (k.kty === 'RSA' || k.kty === undefined));
    if (!jwk) return { ok: false, reason: 'unknown_kid' };
  }

  let signatureOk = false;
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
    );
    signatureOk = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', publicKey,
      decodeJwtSegmentBytes(segments[2]),
      new TextEncoder().encode(`${segments[0]}.${segments[1]}`),
    );
  } catch {
    return { ok: false, reason: 'invalid_signature' };
  }
  if (!signatureOk) return { ok: false, reason: 'invalid_signature' };

  const iss = typeof claims.iss === 'string' ? claims.iss : '';
  if (!GOOGLE_OIDC_ISSUERS.has(iss)) return { ok: false, reason: 'bad_issuer' };

  const aud = claims.aud;
  const audOk = typeof aud === 'string'
    ? aud === audience
    : Array.isArray(aud) && aud.includes(audience);
  if (!audOk) return { ok: false, reason: 'bad_audience' };

  const nowSeconds = (options.nowMs ?? Date.now()) / 1000;
  const exp = typeof claims.exp === 'number' ? claims.exp : 0;
  const iat = typeof claims.iat === 'number' ? claims.iat : 0;
  if (exp <= nowSeconds - OIDC_LEEWAY_SECONDS || iat > nowSeconds + OIDC_LEEWAY_SECONDS) {
    return { ok: false, reason: 'token_expired' };
  }

  const email = typeof claims.email === 'string' ? claims.email : '';
  // Match EXATO contra o service account esperado — nunca por sufixo/domínio:
  // `*.gserviceaccount.com` inclui service accounts de projetos alheios.
  if (!email || claims.email_verified !== true || !timingSafeEqual(email, expectedEmail)) {
    return { ok: false, reason: 'bad_email' };
  }

  return { ok: true, reason: 'valid', email };
}

/**
 * Extrai o Bearer do `Authorization` e verifica como token OIDC do Google.
 * Header ausente/não-Bearer/vazio já é veredito de recusa.
 */
export async function verifyGmailOidcRequest(
  headers: Headers,
  options: GoogleOidcVerifyOptions,
): Promise<WebhookAuthVerdict> {
  const authHeader = headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, reason: 'missing_signature' };
  }
  const token = authHeader.slice(7).trim();
  if (!token) return { ok: false, reason: 'missing_signature' };
  return verifyGoogleOidcToken(token, options);
}
