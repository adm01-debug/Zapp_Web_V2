import { classifyProviderFailure, handleMessageDeliveryRequest, providerPayload } from './index.ts';

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
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
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
      reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
    }, null, { fullName: '', phoneNumber: 'not-a-phone' });
  } catch { rejected = true; }
  if (!rejected) throw new Error('malformed contact payload was accepted');
});

Deno.test('message delivery builds an Evolution buttons body only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '🔘 *Botões:* Escolha',
    message_type: 'buttons', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, null, {
    title: 'Menu',
    body: 'Escolha uma opção',
    buttons: [
      { type: 'reply', displayText: 'Atendimento', id: 'btn_1' },
      { type: 'url', displayText: 'Ver oferta', url: 'https://loja.example/oferta' },
    ],
  });
  if (result.path !== '/message/sendButtons/main') throw new Error('wrong buttons route');
  if (result.body.number !== '5511999999999') throw new Error('wrong recipient');
  if (result.body.title !== 'Menu') throw new Error('title not forwarded');
  if (result.body.description !== 'Escolha uma opção') throw new Error('body must map to description');
  if (result.body.footer !== ' ') throw new Error('missing footer must become a single space (GO rejects empty)');
  const buttons = result.body.buttons as Record<string, unknown>[];
  if (buttons.length !== 2) throw new Error('buttons not forwarded');
  if (buttons[0].type !== 'reply' || buttons[0].displayText !== 'Atendimento' || buttons[0].id !== 'btn_1') {
    throw new Error('reply button fields not preserved');
  }
  if (buttons[1].type !== 'url' || buttons[1].url !== 'https://loja.example/oferta') {
    throw new Error('CTA URL button fields not preserved');
  }
});

Deno.test('message delivery builds an Evolution list body only from a valid persisted payload', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '📋 *Lista:* Escolha',
    message_type: 'list', media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, null, {
    body: 'Selecione uma categoria',
    footer: 'Promo Brindes',
    buttonText: 'Ver opções',
    sections: [
      { title: 'Produtos', rows: [{ id: 'row_1', title: 'Smartphones', description: 'Linha completa' }] },
    ],
  });
  if (result.path !== '/message/sendList/main') throw new Error('wrong list route');
  if (result.body.description !== 'Selecione uma categoria') throw new Error('body must map to description');
  if (result.body.footer !== 'Promo Brindes') throw new Error('footer not forwarded');
  if (result.body.buttonText !== 'Ver opções') throw new Error('buttonText not forwarded');
  const sections = result.body.sections as { rows: Record<string, unknown>[] }[];
  if (sections.length !== 1 || sections[0].rows.length !== 1) throw new Error('sections not forwarded');
  const row = sections[0].rows[0];
  if (row.title !== 'Smartphones' || row.description !== 'Linha completa' || row.rowId !== 'row_1') {
    throw new Error('list row must keep title/description and map id to rowId');
  }
});

Deno.test('message delivery rejects malformed persisted interactive payloads', () => {
  const claim = {
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: 'x',
    media_url: null, caption: null, media_filename: null, media_mimetype: null,
    reply_external_id: null, whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  };
  const cases: { type: 'buttons' | 'list'; payload: Record<string, unknown>; expected: string }[] = [
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: '', buttons: [{ type: 'reply', displayText: 'Ok' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [
      { type: 'reply', displayText: '1' }, { type: 'reply', displayText: '2' },
      { type: 'reply', displayText: '3' }, { type: 'reply', displayText: '4' },
    ] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'url', displayText: 'Abrir', url: 'javascript:alert(1)' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'reply' }] } },
    // Evolution só conhece reply/url/call: 'phone' não é tipo aceito.
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'phone', displayText: 'Ligar', phoneNumber: '5511999990001' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'call', displayText: 'Ligar' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'call', displayText: 'Ligar', phoneNumber: '123' }] } },
    { type: 'buttons', expected: 'invalid_buttons_payload', payload: { body: 'b', buttons: [{ type: 'reply', displayText: 'Ok' }] } },
    { type: 'list', expected: 'invalid_list_payload', payload: { body: 'b', buttonText: 'Ver', sections: [] } },
    { type: 'list', expected: 'invalid_list_payload', payload: { body: 'b', buttonText: 'Ver', sections: [{ title: 'S', rows: [{ title: 'T' }] }] } },
  ];
  for (const { type, payload, expected } of cases) {
    let rejected = '';
    try {
      providerPayload({ ...claim, message_type: type }, null, payload);
    } catch (error) {
      rejected = error instanceof Error ? error.message : 'unknown';
    }
    if (rejected !== expected) {
      throw new Error(`payload ${JSON.stringify(payload)} should fail with ${expected}, got ${rejected || 'accepted'}`);
    }
  }
});

Deno.test('media delivery never turns timeline placeholders into captions and preserves quoted replies', () => {
  const result = providerPayload({
    message_id: 'm', contact_id: 'c', agent_id: 'a', content: '[Imagem]',
    message_type: 'image', media_url: 'https://storage.invalid/image', caption: null,
    media_filename: null, media_mimetype: null, reply_external_id: 'wa-message-id',
    whatsapp_instance_name: 'main', contact_phone: '5511999999999', claim_token: 't',
  }, 'https://signed.invalid/image');
  if ('caption' in result.body) throw new Error('internal media placeholder became a provider caption');
  const quoted = result.body.quoted as { key?: { id?: string } } | undefined;
  if (quoted?.key?.id !== 'wa-message-id') throw new Error('quoted reply metadata was not preserved');
});

// ── PD-80: código estável no corpo de erro + retryable/ambiguous ─────────────
// O handler não tinha costura de dependências; ela foi adicionada (parâmetro
// opcional `deps`) para exercitar os RAMOS DE VERDADE do handler sem banco nem
// rede. Nada disso muda o caminho de produção (os defaults são os reais).

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
const CONTACT_PHONE = '5511999999999';

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };
interface Chain {
  select: (columns?: string) => Chain;
  eq: (column?: string, value?: unknown) => Chain;
  in: (column?: string, values?: readonly unknown[]) => Chain;
  update: (patch?: Row) => Chain;
  maybeSingle: () => Promise<RpcResult>;
  single: () => Promise<RpcResult>;
}

interface FakeClient {
  from: (table: string) => Chain;
  rpc: (fn: string, args?: Row) => Promise<RpcResult>;
  rpcCalls: { fn: string; args?: Row }[];
}

function makeClient(cfg: {
  claim?: RpcResult;
  complete?: RpcResult;
  messages?: RpcResult[];
  /** RPCs que falham devolvendo `error` (o handler loga e segue). */
  rpcErrors?: Record<string, { code?: string; message?: string }>;
  /** RPCs que LANÇAM (o handler absorve em try/catch). */
  rpcThrows?: string[];
}): FakeClient {
  const rpcCalls: { fn: string; args?: Row }[] = [];
  const messagesQueue: RpcResult[] = [...(cfg.messages ?? [])];
  return {
    rpcCalls,
    from(table: string): Chain {
      let result: RpcResult = { data: null, error: null };
      if (table === 'profiles') result = { data: { id: 'profile-1', is_active: true }, error: null };
      if (table === 'messages') result = messagesQueue.shift() ?? { data: null, error: null };
      const chain: Chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        update: () => chain,
        maybeSingle: async () => result,
        single: async () => result,
      };
      return chain;
    },
    async rpc(fn: string, args?: Row): Promise<RpcResult> {
      rpcCalls.push({ fn, args });
      if (cfg.rpcThrows?.includes(fn)) throw new Error(`rpc ${fn} exploded`);
      if (cfg.rpcErrors?.[fn]) return { data: null, error: cfg.rpcErrors[fn] };
      if (fn === 'claim_outbound_message') return cfg.claim ?? { data: [], error: null };
      if (fn === 'complete_outbound_message') return cfg.complete ?? { data: { id: 'msg-1', status: 'sent' }, error: null };
      if (fn === 'enqueue_ai_job') return { data: 'job-1', error: null };
      return { data: null, error: null };
    },
  };
}

const CLAIM: Row = {
  message_id: MESSAGE_ID, contact_id: 'contact-1', agent_id: 'profile-1',
  content: 'olá', message_type: 'text', media_url: null, caption: null,
  media_filename: null, media_mimetype: null, reply_external_id: null,
  whatsapp_instance_name: 'main', contact_phone: CONTACT_PHONE, claim_token: 'token-1',
};

function postRequest(body: Row = { messageId: MESSAGE_ID }): Request {
  return new Request('https://edge.invalid', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeps(client: FakeClient, provider: () => Promise<Response>) {
  return {
    requireAuth: async () => ({ userId: 'user-1' }),
    enforceRateLimit: async () => ({ allowed: true }),
    createClient: () => client,
    requireEnv: (name: string) => (name === 'EVOLUTION_API_URL' ? 'https://evolution.invalid' : 'x'),
    evoFetch: provider,
  };
}

function assertEqual(actual: unknown, expected: unknown, label = 'value') {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function jsonOf(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}
function rpcCalled(client: FakeClient, fn: string): boolean {
  return client.rpcCalls.some((call) => call.fn === fn);
}

/** Args da PRIMEIRA chamada de `fn` (ou undefined se nunca foi chamada). */
function rpcArgs(client: FakeClient, fn: string): Row | undefined {
  return client.rpcCalls.find((call) => call.fn === fn)?.args;
}

/**
 * Afirma o contrato do `failClaim` (motivo do desfecho): a mensagem certa, o
 * mesmo token do claim e `p_retryable=false` — resposta ambígua NUNCA é
 * reenviada automaticamente (um reenvio cego duplicaria a mensagem do cliente).
 */
function assertFailClaim(client: FakeClient, expectedClaimToken = 'token-1'): void {
  const args = rpcArgs(client, 'fail_outbound_message');
  if (!args) throw new Error('fail_outbound_message não foi chamado');
  assertEqual(args.p_message_id, MESSAGE_ID, 'fail p_message_id');
  assertEqual(args.p_claim_token, expectedClaimToken, 'fail p_claim_token');
  assertEqual(args.p_retryable, false, 'fail p_retryable');
}

/**
 * Afirma o MOTIVO do enfileiramento da reconciliação: chave idempotente estável
 * (`reconcile:message.send:<id>`, UNIQUE de ai_jobs) e o payload que o varredor
 * lê. `external_id=null` = a confirmação nunca chegou; com id = confirma o
 * recibo já conhecido. SEMPRE somente-leitura: o kind `effect.reconcile`.
 */
function assertReconcileEnqueued(client: FakeClient, expectedExternalId: string | null): void {
  const args = rpcArgs(client, 'enqueue_ai_job');
  if (!args) throw new Error('enqueue_ai_job não foi chamado');
  assertEqual(args.p_kind, 'effect.reconcile', 'reconcile p_kind');
  assertEqual(args.p_idempotency_key, `reconcile:message.send:${MESSAGE_ID}`, 'reconcile idempotency_key');
  const payload = args.p_payload as Row;
  if (!payload) throw new Error('enqueue_ai_job sem p_payload');
  assertEqual(payload.effect, 'message.send', 'reconcile payload.effect');
  assertEqual(payload.source_table, 'messages', 'reconcile payload.source_table');
  assertEqual(payload.source_id, MESSAGE_ID, 'reconcile payload.source_id');
  assertEqual(payload.external_id, expectedExternalId, 'reconcile payload.external_id');
}

Deno.test('PD-80: recusa de número pelo provedor vira code=invalid_number, não ambíguo e sem reconciliação', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(400, { message: 'Number is not registered on WhatsApp' })));
  assertStatus(response.status, 422);
  const body = await response.json() as Row;
  assertEqual(body.code, 'invalid_number', 'code');
  assertEqual(body.retryable, false, 'retryable');
  assertEqual(body.ambiguous, false, 'ambiguous');
  assertFailClaim(client);
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: instância desconectada vira code=instance_unavailable (409) sem confundir com número inválido', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(400, { message: 'Connection Closed' })));
  assertStatus(response.status, 409);
  const body = await response.json() as Row;
  assertEqual(body.code, 'instance_unavailable', 'code');
  assertEqual(body.retryable, true, 'retryable');
  assertEqual(body.ambiguous, false, 'ambiguous');
  assertFailClaim(client);
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: 401 do provedor vira code=instance_unavailable', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(401, { message: 'Unauthorized' })));
  assertStatus(response.status, 409);
  const body = await response.json() as Row;
  assertEqual(body.code, 'instance_unavailable', 'code');
  assertEqual(body.retryable, true, 'retryable');
  assertEqual(body.ambiguous, false, 'ambiguous');
  assertFailClaim(client);
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: 429 do provedor vira code=rate_limited e não reconcilia', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(429, { message: 'Too Many Requests' })));
  assertStatus(response.status, 429);
  const body = await response.json() as Row;
  assertEqual(body.code, 'rate_limited', 'code');
  assertEqual(body.retryable, true, 'retryable');
  assertEqual(body.ambiguous, false, 'ambiguous');
  assertFailClaim(client);
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: recusa 4xx genérica do provedor não reconcilia (só 5xx/ambíguo reconcilia)', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(400, { message: 'recipient blocked you' })));
  assertStatus(response.status, 422);
  const body = await response.json() as Row;
  assertEqual(body.code, 'provider_rejected', 'code');
  assertEqual(body.ambiguous, false, 'ambiguous');
  assertFailClaim(client);
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: 5xx do provedor vira code=provider_unavailable, ambíguo e reconcilia; sem dado pessoal no corpo', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(500, { message: `internal error paying ${CONTACT_PHONE}` })));
  assertStatus(response.status, 502);
  const body = await response.json() as Row;
  assertEqual(body.code, 'provider_unavailable', 'code');
  assertEqual(body.retryable, false, 'retryable');
  assertEqual(body.ambiguous, true, 'ambiguous');
  assertFailClaim(client);
  assertReconcileEnqueued(client, null);
  const serialized = JSON.stringify(body);
  if (serialized.includes(CONTACT_PHONE)) throw new Error('resposta vazou telefone do provedor');
  if (serialized.includes('internal error paying')) throw new Error('resposta vazou texto do provedor');
});

Deno.test('PD-80: 200 sem id do provedor vira code=receipt_unconfirmed e reconcilia', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(200, { status: 'PENDING' })));
  assertStatus(response.status, 502);
  const body = await response.json() as Row;
  assertEqual(body.code, 'receipt_unconfirmed', 'code');
  assertEqual(body.ambiguous, true, 'ambiguous');
  assertFailClaim(client);
  assertReconcileEnqueued(client, null);
});

Deno.test('PD-80: falha ao gravar o recibo (pós-POST) vira code=receipt_unconfirmed e reconcilia', async () => {
  const client = makeClient({
    claim: { data: [CLAIM], error: null },
    complete: { data: null, error: { code: 'XX000', message: 'rpc down' } },
  });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(200, { key: { id: 'wamid.provider-1' } })));
  assertStatus(response.status, 502);
  const body = await response.json() as Row;
  assertEqual(body.code, 'receipt_unconfirmed', 'code');
  assertEqual(body.ambiguous, true, 'ambiguous');
  assertFailClaim(client);
  assertReconcileEnqueued(client, 'wamid.provider-1');
});

Deno.test('PD-80: falha ANTES do POST (carga inválida) vira code=media_invalid, não ambíguo e NÃO chama o provedor', async () => {
  const invalidClaim = { ...CLAIM, message_type: 'location', content: 'nao-e-json' };
  const client = makeClient({ claim: { data: [invalidClaim], error: null } });
  let providerCalled = false;
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () => {
    providerCalled = true;
    return jsonOf(200, {});
  }));
  assertStatus(response.status, 422);
  const body = await response.json() as Row;
  assertEqual(body.code, 'media_invalid', 'code');
  assertEqual(body.ambiguous, false, 'ambiguous');
  assertEqual(providerCalled, false, 'provedor chamado antes do POST');
  assertFailClaim(client);
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: exceção de rede DEPOIS do POST vira code=receipt_unconfirmed e reconcilia', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () => {
    throw new Error('socket timeout');
  }));
  assertStatus(response.status, 502);
  const body = await response.json() as Row;
  assertEqual(body.code, 'receipt_unconfirmed', 'code');
  assertEqual(body.ambiguous, true, 'ambiguous');
  assertFailClaim(client);
  assertReconcileEnqueued(client, null);
});

Deno.test('PD-80: limite de envios do próprio Zapp vira code=rate_limited (429)', async () => {
  const client = makeClient({});
  const deps = makeDeps(client, async () => jsonOf(200, {}));
  const response = await handleMessageDeliveryRequest(postRequest(), {
    ...deps,
    enforceRateLimit: async () => ({ allowed: false }),
  });
  assertStatus(response.status, 429);
  const body = await response.json() as Row;
  assertEqual(body.code, 'rate_limited', 'code');
  assertEqual(body.retryable, true, 'retryable');
  assertEqual(body.ambiguous, false, 'ambiguous');
});

Deno.test('PD-80: envio em andamento devolve code=in_progress (409) sem reenviar', async () => {
  const client = makeClient({
    claim: { data: [], error: null },
    messages: [{ data: { agent_id: 'profile-1', sender: 'agent', status: 'sending', external_id: null }, error: null }],
  });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () => jsonOf(200, {})));
  assertStatus(response.status, 409);
  const body = await response.json() as Row;
  assertEqual(body.code, 'in_progress', 'code');
  assertEqual(body.retryable, false, 'retryable');
  assertEqual(body.ambiguous, false, 'ambiguous');
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: entrega já confirmada continua idempotente (200) — comportamento preservado', async () => {
  const client = makeClient({
    claim: { data: [], error: null },
    messages: [{ data: { agent_id: 'profile-1', sender: 'agent', status: 'sent', external_id: 'wamid.previous' }, error: null }],
  });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () => jsonOf(200, {})));
  assertStatus(response.status, 200);
  const body = await response.json() as Row;
  assertEqual(body.idempotent, true, 'idempotent');
  assertEqual(body.externalId, 'wamid.previous', 'externalId');
  assertEqual(body.code, undefined, 'code');
});

Deno.test('PD-80: caminho feliz devolve 200 sem code e preserva contrato antigo', async () => {
  const client = makeClient({ claim: { data: [CLAIM], error: null } });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(200, { key: { id: 'wamid.provider-2' } })));
  assertStatus(response.status, 200);
  const body = await response.json() as Row;
  assertEqual(body.idempotent, false, 'idempotent');
  assertEqual(body.externalId, 'wamid.provider-2', 'externalId');
  assertEqual(body.code, undefined, 'code');
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: classifyProviderFailure é a fonte única do código por ramo', () => {
  assertEqual(classifyProviderFailure(429, {}).code, 'rate_limited', '429');
  assertEqual(classifyProviderFailure(500, {}).code, 'provider_unavailable', '500');
  assertEqual(classifyProviderFailure(400, { message: 'no such user' }).code, 'invalid_number', '400 numero');
  assertEqual(classifyProviderFailure(503, { message: 'Connection Closed' }).code, 'provider_unavailable', '503 instancia');
  assertEqual(classifyProviderFailure(400, { message: 'recipient blocked you' }).code, 'provider_rejected', '400 recusa');
  assertEqual(classifyProviderFailure(500, {}).ambiguous, true, '500 ambiguo');
  assertEqual(classifyProviderFailure(422, { message: 'no such user' }).ambiguous, false, '422 nao ambiguo');
});

Deno.test('PD-80: claim vazio de mensagem de OUTRO agente devolve 404 (linha EXISTE e é negada, não é 409)', async () => {
  const client = makeClient({
    claim: { data: [], error: null },
    messages: [{ data: { agent_id: 'profile-2', sender: 'agent', status: 'sending', external_id: null }, error: null }],
  });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () => jsonOf(200, {})));
  assertStatus(response.status, 404);
  const body = await response.json() as Row;
  assertEqual(body.error, 'Message not found', 'error');
  // A linha existe e está 'sending': se a guarda de dono caísse, isto seria o
  // 409 de in_progress — logo, 404 sem `code` prova que a ACL barrou, não que faltou a linha.
  assertEqual(body.code, undefined, 'code (404 puro, distinto do 409 in_progress)');
  assertEqual(rpcCalled(client, 'fail_outbound_message'), false, 'fail_outbound_message');
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: claim vazio de mensagem de ENTRADA (sender≠agent) devolve 404', async () => {
  const client = makeClient({
    claim: { data: [], error: null },
    messages: [{ data: { agent_id: 'profile-1', sender: 'contact', status: 'received', external_id: null }, error: null }],
  });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () => jsonOf(200, {})));
  assertStatus(response.status, 404);
  const body = await response.json() as Row;
  assertEqual(body.error, 'Message not found', 'error');
  assertEqual(body.code, undefined, 'code');
});

Deno.test('PD-80: claim vazio de mensagem inexistente devolve 404 sem inventar envio', async () => {
  const client = makeClient({
    claim: { data: [], error: null },
    messages: [{ data: null, error: null }],
  });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () => jsonOf(200, {})));
  assertStatus(response.status, 404);
  const body = await response.json() as Row;
  assertEqual(body.error, 'Message not found', 'error');
  assertEqual(rpcCalled(client, 'fail_outbound_message'), false, 'fail_outbound_message');
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: métrica mark_first_response falhando (erro) NÃO derruba um envio já confirmado', async () => {
  const client = makeClient({
    claim: { data: [CLAIM], error: null },
    rpcErrors: { mark_first_response: { code: 'XX000', message: 'metric down' } },
  });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(200, { key: { id: 'wamid.provider-3' } })));
  assertStatus(response.status, 200);
  const body = await response.json() as Row;
  assertEqual(body.idempotent, false, 'idempotent');
  assertEqual(body.externalId, 'wamid.provider-3', 'externalId');
  assertEqual(body.code, undefined, 'code');
  assertEqual(rpcCalled(client, 'mark_first_response'), true, 'mark_first_response');
  assertEqual((rpcArgs(client, 'mark_first_response') as Row).p_contact_id, 'contact-1', 'metric p_contact_id');
  assertEqual(rpcCalled(client, 'fail_outbound_message'), false, 'fail_outbound_message');
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

Deno.test('PD-80: métrica mark_first_response LANÇANDO NÃO derruba um envio já confirmado', async () => {
  const client = makeClient({
    claim: { data: [CLAIM], error: null },
    rpcThrows: ['mark_first_response'],
  });
  const response = await handleMessageDeliveryRequest(postRequest(), makeDeps(client, async () =>
    jsonOf(200, { key: { id: 'wamid.provider-4' } })));
  assertStatus(response.status, 200);
  const body = await response.json() as Row;
  assertEqual(body.idempotent, false, 'idempotent');
  assertEqual(body.externalId, 'wamid.provider-4', 'externalId');
  assertEqual(body.code, undefined, 'code');
  assertEqual(rpcCalled(client, 'fail_outbound_message'), false, 'fail_outbound_message');
  assertEqual(rpcCalled(client, 'enqueue_ai_job'), false, 'enqueue_ai_job');
});

