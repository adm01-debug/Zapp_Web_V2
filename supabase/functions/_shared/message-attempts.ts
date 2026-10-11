/**
 * message-attempts.ts — log de tentativas de envio por mensagem (faixa C da
 * auditoria de paridade V3→V2, 11/10/2026).
 *
 * Por que existe: a Edge `message-delivery` já faz claim/complete/fail da
 * mensagem, mas o erro do provedor de CADA tentativa se perdia — o Histórico de
 * envio não dizia POR QUE falhou. Este módulo guarda a tentativa em
 * `public.message_attempts` (migration `20261011124430_message_attempts.sql`).
 *
 * Regra crítica do cartão: o log é TELEMETRIA. Falha ao registrar NUNCA pode
 * transformar um envio bem-sucedido em falha visível ao cliente — por isso
 * `logMessageAttempt` engole o erro e só registra o código no log da função.
 *
 * Privacidade: `error_message` e `provider_response` chegam aqui CRUS e saem
 * SANITIZADOS (telefone, tokens, URLs assinadas e o texto da mensagem são
 * removidos antes de qualquer escrita). A tabela é lida só por admin/service.
 */

/** Desfechos aceitos pela CHECK de `message_attempts.outcome`. */
export type AttemptOutcome = 'claimed' | 'sent' | 'failed_retryable' | 'failed_final';

/** Cliente mínimo de RPC (satisfeito pelo supabase-js e por um fake de teste). */
export interface AttemptLogClient {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
}

/** Valores conhecidos que podem ter PII e devem ser removidos do texto. */
export interface RedactionSecrets {
  /** Telefone do destinatário (com ou sem formatação). */
  phone?: string | null;
  /** Texto/corpo da mensagem e legenda — nunca deve sobrar no log. */
  messageText?: string | null;
  /** Credenciais em escopo (ex.: a chave do provedor). */
  tokens?: (string | null | undefined)[];
}

export const PHONE_REDACTION = '[telefone]';
export const TOKEN_REDACTION = '[token]';
export const URL_REDACTION = '[url]';
export const MESSAGE_REDACTION = '[mensagem]';

/** Limites alinhados à migration (error_message <= 500) e ao tamanho de jsonb. */
const MAX_ERROR_MESSAGE = 500;
const MAX_PROVIDER_RESPONSE = 2000;

function redactKnownValue(text: string, value: string | null | undefined, marker: string, min = 4): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw.length < min) return text;
  return text.split(raw).join(marker);
}

function redactPhones(text: string): string {
  return text.replace(/(\+?\d[\d\s().-]{6,}\d)/g, (match) => {
    const digits = match.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? PHONE_REDACTION : match;
  });
}

function redactSignedUrls(text: string): string {
  return text.replace(/https?:\/\/[^\s"'\\<>]+/g, (url) => {
    // URL com query string (assinatura/token) ou parâmetros de assinatura conhecidos.
    return /[?]|X-Amz|signature|expires=|\btoken=/i.test(url) ? URL_REDACTION : url;
  });
}

function redactTokens(text: string): string {
  let out = text;
  // Bearer <credencial>
  out = out.replace(/(bearer\s+)[A-Za-z0-9._~+/-]{4,}/gi, `$1${TOKEN_REDACTION}`);
  // JWT (header.payload.signature)
  out = out.replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, TOKEN_REDACTION);
  // chave/valor de segredo em JSON, querystring ou cabeçalho
  out = out.replace(
    /((?:apikey|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|signature|token)\s*["']?\s*[:=]\s*["']?)([A-Za-z0-9._~+/-]{6,})/gi,
    `$1${TOKEN_REDACTION}`,
  );
  // blobs longos (hex/base64) que costumam ser credencial ou assinatura
  out = out.replace(/\b[A-Fa-f0-9]{32,}\b/g, TOKEN_REDACTION);
  out = out.replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, TOKEN_REDACTION);
  return out;
}

/**
 * Remove PII de um texto livre antes de gravar no log:
 * valores conhecidos (telefone, texto da mensagem, tokens em escopo) e padrões
 * genéricos (URLs assinadas, credenciais, telefones). Devolve `null` se a
 * entrada não for string.
 */
export function sanitizeAttemptText(value: unknown, secrets: RedactionSecrets = {}): string | null {
  if (typeof value !== 'string') return null;
  let text = value;

  for (const token of secrets.tokens ?? []) {
    text = redactKnownValue(text, token, TOKEN_REDACTION, 6);
  }
  const phoneRaw = typeof secrets.phone === 'string' ? secrets.phone.trim() : '';
  const phoneDigits = phoneRaw.replace(/\D/g, '');
  if (phoneDigits.length >= 8) {
    text = redactKnownValue(text, phoneDigits, PHONE_REDACTION, 8);
  }
  text = redactKnownValue(text, phoneRaw, PHONE_REDACTION, 8);
  text = redactKnownValue(text, secrets.messageText, MESSAGE_REDACTION, 3);

  text = redactSignedUrls(text);
  text = redactTokens(text);
  text = redactPhones(text);
  return text;
}

/**
 * Sanitiza `provider_response` (objeto ou string crua): serializa, limpa e
 * devolve o JSON sanitizado. Se o texto deixar de ser JSON válido após a
 * limpeza, devolve `{ raw: <texto> }`. Trunca para não inflar o jsonb.
 */
export function sanitizeProviderResponse(value: unknown, secrets: RedactionSecrets = {}): unknown {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  if (!raw) return null;
  const cleaned = (sanitizeAttemptText(raw, secrets) ?? '').slice(0, MAX_PROVIDER_RESPONSE);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    return { raw: cleaned };
  }
}

export interface DeliveryErrorClassification {
  error_code: string;
  provider_status: number | null;
}

/**
 * Mapeia a falha do provedor para um `error_code` estável:
 * `timeout`, `connection_unavailable`, `rate_limited`, `invalid_number`,
 * `provider_http_<status>` ou `unknown`.
 */
export function classifyDeliveryError(input: {
  status?: number | null;
  body?: string | null;
  error?: unknown;
}): DeliveryErrorClassification {
  const status = typeof input.status === 'number' ? input.status : null;

  if (input.error !== undefined && input.error !== null) {
    const name = input.error instanceof Error ? input.error.name : '';
    const message = input.error instanceof Error ? input.error.message : String(input.error);
    if (/abort|timeout|timed out/i.test(name) || /timeout|timed out/i.test(message)) {
      return { error_code: 'timeout', provider_status: status };
    }
    if (/econnrefused|econnreset|enotfound|eai_again|fetch failed|network|connection|socket/i.test(message)) {
      return { error_code: 'connection_unavailable', provider_status: status };
    }
    return { error_code: 'unknown', provider_status: status };
  }

  if (status === null) return { error_code: 'unknown', provider_status: null };
  if (status === 429) return { error_code: 'rate_limited', provider_status: status };

  const body = typeof input.body === 'string' ? input.body : '';
  if (status >= 400 && status < 500) {
    if (/exists\s*"?\s*:?\s*false|not.*(?:on\s*whatsapp|registered)|invalid.*(?:number|phone|jid)|numero.*invalido/i.test(body)) {
      return { error_code: 'invalid_number', provider_status: status };
    }
    if (/rate.?limit|too many requests/i.test(body)) {
      return { error_code: 'rate_limited', provider_status: status };
    }
  }
  return { error_code: `provider_http_${status}`, provider_status: status };
}

/** Detalhe sanitizado a gravar numa tentativa. */
export interface MessageAttemptInput {
  messageId: string;
  attemptNo: number;
  outcome: AttemptOutcome;
  errorCode?: string | null;
  errorMessage?: string | null;
  providerStatus?: number | null;
  providerResponse?: unknown;
  durationMs?: number | null;
}

function toAttemptNumber(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function toDuration(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.trunc(value);
}

/**
 * Grava UMA tentativa em `message_attempts`. NUNCA lança e NUNCA rejeita: uma
 * falha de telemetria só aparece no log da função (`event`). Devolve `true` se
 * a RPC confirmou e `false` em qualquer falha.
 */
export async function logMessageAttempt(
  client: AttemptLogClient,
  input: MessageAttemptInput,
  secrets: RedactionSecrets = {},
): Promise<boolean> {
  try {
    const errorMessage = sanitizeAttemptText(input.errorMessage ?? null, secrets);
    const { error } = await client.rpc('log_message_attempt', {
      p_message_id: input.messageId,
      p_attempt_no: toAttemptNumber(input.attemptNo),
      p_outcome: input.outcome,
      p_error_code: input.errorCode ?? null,
      p_error_message: errorMessage ? errorMessage.slice(0, MAX_ERROR_MESSAGE) : null,
      p_provider_status: input.providerStatus ?? null,
      p_provider_response: sanitizeProviderResponse(input.providerResponse, secrets),
      p_duration_ms: toDuration(input.durationMs),
    });
    if (error) {
      console.error(JSON.stringify({
        event: 'message_delivery_attempt_log_error',
        code: error.code ?? 'unknown',
      }));
      return false;
    }
    return true;
  } catch (error) {
    console.error(JSON.stringify({
      event: 'message_delivery_attempt_log_error',
      code: error instanceof Error ? error.message : 'unknown',
    }));
    return false;
  }
}
