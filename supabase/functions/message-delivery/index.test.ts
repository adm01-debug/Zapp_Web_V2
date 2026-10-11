import { deliverClaimedMessage, handleMessageDeliveryRequest, providerPayload, type Claim } from './index.ts';

function assertStatus(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`expected HTTP ${expected}, got ${actual}`);
}

Deno.test('message delivery rejects methods other than POST before reading secrets', async () => {
  const response = await handleMessageDeliveryRequest(new Request('https://edge.invalid', { method: 'GET' }));
  assertStatus(response.status, 405);
});

Deno.test('message delivery rejects unauthenticated callers before reading the body', async () => {
  const response = await handleMessageDeliveryRequest(new Request('https://edge.invalid', {
    method: 'POST', body: 'not-json',
  }));
  assertStatus(response.status, 401);
});

Deno.test('message delivery builds an Evolution poll only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📊 *Enquete:* Preferência',
    message_type: 'poll', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't', delivery_attempt_count: 1,
  }, null, { name: 'Preferência', values: ['A', 'B'], selectableCount: 1 });
  if (result.path !== '/message/sendPoll/main') throw new Error('wrong poll route');
  if (result.body.number !== '5511999999999') throw new Error('wrong recipient');
});

Deno.test('message delivery rejects a malformed persisted contact payload', () => {
  let rejected = false;
  try {
    providerPayload({
      message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📇 Cartão de contato',
      message_type: 'contact', media_url: null, caption: null, media_filename: null, media_mimetype: null,
      reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't', delivery_attempt_count: 1,
    }, null, { fullName: '', phoneNumber: 'not-a-phone' });
  } catch { rejected = true; }
  if (!rejected) throw new Error('malformed contact payload was accepted');
});

Deno.test('media delivery never turns timeline placeholders into captions and preserves quoted replies', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '[Imagem]',
    message_type: 'image', media_url: 'https://storage.invalid/image', caption: null,
    media_filename: null, media_mimetype: null, reply_external_id: 'wa-message-id',
    whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't', delivery_attempt_count: 1,
  }, 'https://signed.invalid/image');
  if ('caption' in result.body) throw new Error('internal media placeholder became a provider caption');
  const quoted = result.body.quoted as { key?: { id?: string } } | undefined;
  if (quoted?.key?.id !== 'wa-message-id') throw new Error('quoted reply metadata was not preserved');
});

// ─────────────────────────────────────────────────────────────────────────────
// Log de tentativas (faixa C): cada desfecho grava a linha certa e o log NUNCA
// muda o resultado do envio. `deliverClaimedMessage` é injetável (cliente e
// `fetch` falsos) para rodar sem rede externa.
// ─────────────────────────────────────────────────────────────────────────────

type RpcCall = { fn: string; args: Record<string, unknown> };

function attemptClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    message_id: '11111111-1111-4111-8111-111111111111',
    contact_id: '22222222-2222-4222-8222-222222222222',
    agent_id: '33333333-3333-4333-8333-333333333333',
    content: 'seu pedido saiu para entrega',
    message_type: 'text',
    media_url: null,
    caption: null,
    media_filename: null,
    media_mimetype: null,
    reply_external_id: null,
    whatsapp_instance_name: 'main',
    contact_phone: '5511999999999',
    claim_token: 'claim-token',
    delivery_attempt_count: 1,
    ...overrides,
  };
}

function makeService(opts: {
  complete?: unknown;
  completeError?: { code?: string } | null;
  logError?: { code?: string } | null;
} = {}) {
  const calls: RpcCall[] = [];
  const service = {
    rpc(fn: string, args: Record<string, unknown> = {}) {
      calls.push({ fn, args });
      if (fn === 'complete_outbound_message') {
        return Promise.resolve({ data: opts.complete ?? { id: 'row-1', status: 'sent' }, error: opts.completeError ?? null });
      }
      if (fn === 'log_message_attempt') {
        return Promise.resolve({ data: true, error: opts.logError ?? null });
      }
      return Promise.resolve({ data: 'job-1', error: null });
    },
    from() {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) };
    },
  };
  return { service, calls };
}

type FetchFn = (url: string, options: RequestInit) => Promise<Response>;

function jsonFetcher(status: number, body: unknown): FetchFn {
  return (url: string, options: RequestInit) => {
    if (typeof url !== 'string' || !url.startsWith('https://evo.local')) {
      throw new Error(`unexpected provider url: ${url}`);
    }
    void options;
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return Promise.resolve(new Response(text, { status, headers: { 'Content-Type': 'application/json' } }));
  };
}

// deno-lint-ignore no-explicit-any
function deliverDeps(service: unknown, fetcher: FetchFn): any {
  return {
    service,
    caller: { storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'x' }, error: null }) }) } },
    supabaseUrl: 'https://proj.supabase.co',
    evolutionUrl: 'https://evo.local',
    evolutionKey: 'evo-key',
    fetcher,
    req: new Request('https://fn.local', { method: 'POST' }),
  };
}

function attemptLogs(calls: RpcCall[]) {
  return calls.filter((c) => c.fn === 'log_message_attempt').map((c) => c.args);
}

Deno.test('message delivery registra claimed e sent quando o provedor aceita', async () => {
  Deno.env.set('EVOLUTION_API_FLAVOR', 'v2');
  const { service, calls } = makeService();
  const res = await deliverClaimedMessage(
    attemptClaim(),
    deliverDeps(service, jsonFetcher(200, { key: { id: 'wamid-1' } })),
  );

  assertStatus(res.status, 200);
  const logs = attemptLogs(calls);
  const outcomes = logs.map((l) => l.p_outcome);
  if (outcomes.join(',') !== 'claimed,sent') throw new Error(`outcomes errados: ${outcomes.join(',')}`);
  if (logs.some((l) => l.p_attempt_no !== 1)) throw new Error('attempt_no deveria ser 1');
  const sent = logs.find((l) => l.p_outcome === 'sent');
  if (!sent || sent.p_provider_status !== 200) throw new Error('provider_status do sent errado');
  if (calls.some((c) => c.fn === 'fail_outbound_message')) throw new Error('não deveria falhar');
});

Deno.test('message delivery usa delivery_attempt_count como attempt_no', async () => {
  Deno.env.set('EVOLUTION_API_FLAVOR', 'v2');
  const { service, calls } = makeService();
  const res = await deliverClaimedMessage(
    attemptClaim({ delivery_attempt_count: 2 }),
    deliverDeps(service, jsonFetcher(200, { key: { id: 'wamid-1' } })),
  );
  assertStatus(res.status, 200);
  if (attemptLogs(calls).some((l) => l.p_attempt_no !== 2)) throw new Error('attempt_no não veio do claim');
});

Deno.test('message delivery grava failed_final com error_code estável quando o provedor rejeita', async () => {
  Deno.env.set('EVOLUTION_API_FLAVOR', 'v2');
  const { service, calls } = makeService();
  const res = await deliverClaimedMessage(
    attemptClaim(),
    deliverDeps(service, jsonFetcher(400, { exists: false, message: 'number not on whatsapp' })),
  );

  assertStatus(res.status, 502);
  if (!calls.some((c) => c.fn === 'fail_outbound_message')) throw new Error('faltou fail_outbound_message');
  const failed = attemptLogs(calls).find((l) => l.p_outcome === 'failed_final');
  if (!failed) throw new Error('faltou a tentativa failed_final');
  if (failed.p_error_code !== 'invalid_number') throw new Error(`error_code errado: ${failed.p_error_code}`);
  if (calls.some((c) => c.fn === 'enqueue_ai_job')) throw new Error('não deveria enfileirar reconciliação em 4xx');
});

Deno.test('message delivery em 5xx enfileira reconciliação e grava failed_final', async () => {
  Deno.env.set('EVOLUTION_API_FLAVOR', 'v2');
  const { service, calls } = makeService();
  const res = await deliverClaimedMessage(
    attemptClaim(),
    deliverDeps(service, jsonFetcher(503, { message: 'unavailable' })),
  );

  assertStatus(res.status, 502);
  if (!calls.some((c) => c.fn === 'enqueue_ai_job')) throw new Error('5xx deveria enfileirar reconciliação');
  const failed = attemptLogs(calls).find((l) => l.p_outcome === 'failed_final');
  if (!failed || failed.p_error_code !== 'provider_http_503') {
    throw new Error(`error_code errado: ${failed && failed.p_error_code}`);
  }
});

Deno.test('message delivery não vaza PII do provedor no log da tentativa', async () => {
  Deno.env.set('EVOLUTION_API_FLAVOR', 'v2');
  const { service, calls } = makeService();
  const raw = 'falha para 5511999999999: seu pedido saiu para entrega (token=sk-live-SUPERSEGREDO1234567890)';
  const res = await deliverClaimedMessage(
    attemptClaim(),
    deliverDeps(service, jsonFetcher(400, raw)),
  );

  assertStatus(res.status, 502);
  const failed = attemptLogs(calls).find((l) => l.p_outcome === 'failed_final');
  if (!failed) throw new Error('faltou a tentativa failed_final');
  const serialized = JSON.stringify({ m: failed.p_error_message, r: failed.p_provider_response });
  if (serialized.includes('5511999999999')) throw new Error('telefone vazou no log');
  if (serialized.includes('seu pedido saiu para entrega')) throw new Error('texto da mensagem vazou no log');
  if (serialized.includes('SUPERSEGREDO')) throw new Error('token vazou no log');
});

Deno.test('falha ao gravar a tentativa NÃO muda o resultado do envio', async () => {
  Deno.env.set('EVOLUTION_API_FLAVOR', 'v2');
  const { service, calls } = makeService({ logError: { code: 'XX000' } });
  const res = await deliverClaimedMessage(
    attemptClaim(),
    deliverDeps(service, jsonFetcher(200, { key: { id: 'wamid-1' } })),
  );

  assertStatus(res.status, 200);
  const payload = await res.json() as { status?: string };
  if (payload.status !== 'sent') throw new Error('o envio deveria continuar sent');
  if (!calls.some((c) => c.fn === 'complete_outbound_message')) throw new Error('complete deveria ter rodado');
});
