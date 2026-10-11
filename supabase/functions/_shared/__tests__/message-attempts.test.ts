/**
 * message-attempts.ts — contrato executável do log de tentativas (faixa C).
 *
 * O que fica travado:
 *   1. sanitização remove telefone, token, URL assinada e o texto da mensagem
 *      antes de qualquer escrita (PII não sai da infra);
 *   2. `error_code` é estável por desfecho (timeout, connection_unavailable,
 *      rate_limited, invalid_number, provider_http_<status>, unknown);
 *   3. `logMessageAttempt` NUNCA lança: erro da RPC vira `false` e só aparece no
 *      console — telemetria não muda o resultado do envio.
 */
import { assertEquals, assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyDeliveryError,
  logMessageAttempt,
  MESSAGE_REDACTION,
  PHONE_REDACTION,
  sanitizeAttemptText,
  sanitizeProviderResponse,
  TOKEN_REDACTION,
  URL_REDACTION,
} from "../message-attempts.ts";

const FAKE_TOKEN = 'chave-falsa-de-teste-0000';

const SECRETS = {
  phone: '5511999999999',
  messageText: 'seu pedido saiu para entrega',
  tokens: [FAKE_TOKEN],
};

Deno.test('sanitizeAttemptText remove telefone, token, URL assinada e texto da mensagem', () => {
  const raw = [
    'erro ao enviar para 5511999999999',
    `apikey=${FAKE_TOKEN}`,
    'media https://proj.supabase.co/storage/v1/object/sign/whatsapp-media/a.jpg?token=abc123def456',
    'corpo: seu pedido saiu para entrega',
  ].join(' | ');

  const clean = sanitizeAttemptText(raw, SECRETS) ?? '';

  assert(!clean.includes('5511999999999'), `telefone vazou: ${clean}`);
  assert(!clean.includes(FAKE_TOKEN), `token vazou: ${clean}`);
  assert(!clean.includes('abc123def456'), `assinatura da URL vazou: ${clean}`);
  assert(!clean.includes('seu pedido saiu para entrega'), `texto da mensagem vazou: ${clean}`);
  assertStringIncludes(clean, PHONE_REDACTION);
  assertStringIncludes(clean, TOKEN_REDACTION);
  assertStringIncludes(clean, URL_REDACTION);
  assertStringIncludes(clean, MESSAGE_REDACTION);
});

Deno.test('sanitizeAttemptText remove telefone cru mesmo sem formatação conhecida', () => {
  const clean = sanitizeAttemptText('falha no jid 5511888888888@s.whatsapp.net', {}) ?? '';
  assert(!clean.includes('5511888888888'), `telefone genérico vazou: ${clean}`);
  assertStringIncludes(clean, PHONE_REDACTION);
});

Deno.test('sanitizeAttemptText devolve null para entrada não textual', () => {
  assertEquals(sanitizeAttemptText(null), null);
  assertEquals(sanitizeAttemptText(42), null);
});

Deno.test('sanitizeProviderResponse sanitiza o JSON do provedor e mantém JSON válido', () => {
  const provider = {
    status: 'error',
    number: '5511999999999',
    apikey: FAKE_TOKEN,
    media: 'https://proj.supabase.co/storage/v1/object/sign/whatsapp-media/a.jpg?token=abc123def456',
    body: 'seu pedido saiu para entrega',
  };

  const clean = sanitizeProviderResponse(provider, SECRETS) as Record<string, unknown>;
  const serialized = JSON.stringify(clean);

  assertEquals(clean.status, 'error');
  assert(!serialized.includes('5511999999999'), `telefone vazou: ${serialized}`);
  assert(!serialized.includes(FAKE_TOKEN), `token vazou: ${serialized}`);
  assert(!serialized.includes('abc123def456'), `assinatura vazou: ${serialized}`);
  assert(!serialized.includes('seu pedido saiu para entrega'), `texto vazou: ${serialized}`);
});

Deno.test('sanitizeProviderResponse devolve null para entrada vazia', () => {
  assertEquals(sanitizeProviderResponse(null), null);
  assertEquals(sanitizeProviderResponse(''), null);
});

Deno.test('classifyDeliveryError mapeia status do provedor para error_code estável', () => {
  assertEquals(classifyDeliveryError({ status: 429 }).error_code, 'rate_limited');
  assertEquals(
    classifyDeliveryError({ status: 400, body: '{"exists":false,"message":"number not on whatsapp"}' }).error_code,
    'invalid_number',
  );
  assertEquals(classifyDeliveryError({ status: 503 }).error_code, 'provider_http_503');
  assertEquals(classifyDeliveryError({ status: 400 }).error_code, 'provider_http_400');
});

Deno.test('classifyDeliveryError mapeia erro de rede do fetch', () => {
  assertEquals(classifyDeliveryError({ error: new Error('fetch failed: ECONNREFUSED') }).error_code, 'connection_unavailable');
  assertEquals(classifyDeliveryError({ error: new Error('The operation timed out') }).error_code, 'timeout');
  assertEquals(classifyDeliveryError({ error: new Error('algo inesperado') }).error_code, 'unknown');
});

Deno.test('logMessageAttempt grava os campos sanitizados na RPC', async () => {
  let captured: Record<string, unknown> | null = null;
  const client = {
    rpc: (fn: string, args?: Record<string, unknown>) => {
      assertEquals(fn, 'log_message_attempt');
      captured = args ?? null;
      return Promise.resolve({ data: true, error: null });
    },
  };

  const ok = await logMessageAttempt(client, {
    messageId: 'msg-1',
    attemptNo: 2,
    outcome: 'failed_final',
    errorCode: 'invalid_number',
    errorMessage: 'numero 5511999999999 invalido',
    providerStatus: 400,
    durationMs: 321.9,
  }, SECRETS);

  assert(ok);
  assert(captured !== null);
  const args = captured as Record<string, unknown>;
  assertEquals(args.p_message_id, 'msg-1');
  assertEquals(args.p_attempt_no, 2);
  assertEquals(args.p_outcome, 'failed_final');
  assertEquals(args.p_error_code, 'invalid_number');
  assertEquals(args.p_duration_ms, 321);
  assert(String(args.p_error_message).includes(PHONE_REDACTION));
  assert(!String(args.p_error_message).includes('5511999999999'));
});

Deno.test('logMessageAttempt normaliza attempt_no e duration_ms inválidos', async () => {
  let captured: Record<string, unknown> | null = null;
  const client = {
    rpc: (_fn: string, args?: Record<string, unknown>) => {
      captured = args ?? null;
      return Promise.resolve({ data: true, error: null });
    },
  };
  await logMessageAttempt(client, { messageId: 'msg-1', attemptNo: 0, outcome: 'claimed', durationMs: -5 });
  const args = (captured ?? {}) as Record<string, unknown>;
  assertEquals(args.p_attempt_no, 1);
  assertEquals(args.p_duration_ms, null);
});

Deno.test('logMessageAttempt nunca lança quando a RPC falha', async () => {
  const client = {
    rpc: () => Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } }),
  };
  const ok = await logMessageAttempt(client, { messageId: 'msg-1', attemptNo: 1, outcome: 'sent' });
  assertEquals(ok, false);

  const throwing = {
    rpc: () => { throw new Error('rede caiu'); },
  };
  const ok2 = await logMessageAttempt(throwing, { messageId: 'msg-1', attemptNo: 1, outcome: 'sent' });
  assertEquals(ok2, false);
});
