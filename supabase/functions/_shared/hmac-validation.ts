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
): Promise<WebhookAuthShadowResult> {
  const signature = extractSignatureFromHeaders(headers);

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

  // Sucesso e o caso comum: log, nao warn -- senao o nivel warn deixa de
  // separar anomalia de trafego normal justamente no sinal que este modo existe
  // para produzir.
  console.log(`[WEBHOOK_AUTH_SHADOW] ${handlerName}: assinatura valida`);
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

    console.log('[WEBHOOK_AUTH_SHADOW] elevenlabs-webhook: assinatura valida');
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
  const flat = value.replace(/[\u0000-\u001f\u007f]/g, ' ');
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
