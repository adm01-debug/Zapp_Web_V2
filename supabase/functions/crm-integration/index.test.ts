import { distinctCompanyNames, distinctNameSuggestions, emailCompanySocials, escapeIlikeExact, externalParticipantEmail, handleCRMIntegrationRequest, MAX_NAME_SUGGESTIONS, resolveContactLookup, resolveContactLookupBatch } from './index.ts';

function assertStatus(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`expected HTTP ${expected}, got ${actual}`);
}

const CONTACT_ID = '11111111-2222-4333-8444-555555555555';
const EXTERNAL_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function lookupDeps(overrides: Record<string, unknown> = {}) {
  return {
    getContact: () => Promise.resolve({
      data: { id: CONTACT_ID, phone: '+55 (11) 99999-0000' }, error: null,
    }),
    getStableLink: () => Promise.resolve({
      data: { external_contact_id: EXTERNAL_ID, normalized_phone: '5511999990000' }, error: null,
    }),
    callRpc: () => Promise.resolve({
      data: { found: true, contact_id: EXTERNAL_ID, professional: {}, personal: {}, singu_profile: null },
      error: null,
    }),
    ...overrides,
  };
}

Deno.test('sidebar lookup resolves the expected RPC and logs only bounded telemetry', async () => {
  let calledRpc = '';
  let calledPhone = '';
  let log = '';
  const resolution = await resolveContactLookup(
    { contactId: CONTACT_ID, lookup: 'sidebar' },
    lookupDeps({
      callRpc: (rpc: string, params: { p_phone: string }) => {
        calledRpc = rpc;
        calledPhone = params.p_phone;
        return Promise.resolve({ data: { found: true, contact_id: EXTERNAL_ID }, error: null });
      },
      now: (() => { let value = 100; return () => (value += 7); })(),
      logSidebar: (entry: unknown) => { log = JSON.stringify(entry); },
    }),
  );
  if (!resolution.ok) throw new Error(`sidebar lookup failed: ${resolution.error}`);
  if (calledRpc !== 'get_contact_sidebar_by_phone' || calledPhone !== '5511999990000') {
    throw new Error('sidebar lookup called the wrong RPC or phone');
  }
  if (!log.includes('crm_sidebar_lookup') || log.includes(calledPhone) || log.includes(CONTACT_ID)) {
    throw new Error('sidebar telemetry is missing or contains PII');
  }
});

Deno.test('sidebar lookup returns 409 when the stable identity differs', async () => {
  const resolution = await resolveContactLookup(
    { contactId: CONTACT_ID, lookup: 'sidebar' },
    lookupDeps({
      callRpc: () => Promise.resolve({
        data: { found: true, contact_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' }, error: null,
      }),
    }),
  );
  if (resolution.ok || resolution.status !== 409 || resolution.error !== 'Contact CRM identity mismatch') {
    throw new Error('identity mismatch did not fail closed');
  }
});

Deno.test('intelligence lookup returns 409 when the stable identity differs', async () => {
  const resolution = await resolveContactLookup(
    { contactId: CONTACT_ID, lookup: 'intelligence' },
    lookupDeps({
      callRpc: () => Promise.resolve({
        data: { contact_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', briefing: 'outra pessoa' }, error: null,
      }),
    }),
  );
  if (resolution.ok || resolution.status !== 409 || resolution.error !== 'Contact CRM identity mismatch') {
    throw new Error('intelligence identity mismatch did not fail closed');
  }
});

Deno.test('intelligence lookup resolves when the external identity matches the stable link', async () => {
  let calledRpc = '';
  const resolution = await resolveContactLookup(
    { contactId: CONTACT_ID, lookup: 'intelligence' },
    lookupDeps({
      callRpc: (rpc: string) => {
        calledRpc = rpc;
        return Promise.resolve({ data: { contact_id: EXTERNAL_ID, briefing: 'dados' }, error: null });
      },
    }),
  );
  if (!resolution.ok) throw new Error(`intelligence lookup failed: ${resolution.error}`);
  if (calledRpc !== 'get_contact_intelligence_by_phone') {
    throw new Error(`intelligence lookup called the wrong RPC: ${calledRpc}`);
  }
});

Deno.test('intelligence lookup without a stable link still resolves by phone', async () => {
  const resolution = await resolveContactLookup(
    { contactId: CONTACT_ID, lookup: 'intelligence' },
    lookupDeps({
      getStableLink: () => Promise.resolve({ data: null, error: null }),
      callRpc: () => Promise.resolve({ data: { briefing: 'sem identidade exposta' }, error: null }),
    }),
  );
  if (!resolution.ok) throw new Error(`unlinked intelligence lookup failed: ${resolution.error}`);
});

Deno.test('intelligence lookup requires reverification when the payload has no verifiable identity', async () => {
  const resolution = await resolveContactLookup(
    { contactId: CONTACT_ID, lookup: 'intelligence' },
    lookupDeps({
      callRpc: () => Promise.resolve({ data: { briefing: 'sem contact_id' }, error: null }),
    }),
  );
  if (resolution.ok || resolution.status !== 409 || resolution.error !== 'Contact CRM identity requires reverification') {
    throw new Error('intelligence without verifiable identity did not fail closed');
  }
});

Deno.test('360 lookup returns 409 when the stable identity differs', async () => {
  const resolution = await resolveContactLookup(
    { contactId: CONTACT_ID, lookup: '360' },
    lookupDeps({
      callRpc: () => Promise.resolve({
        data: { contact: { id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff' } }, error: null,
      }),
    }),
  );
  if (resolution.ok || resolution.status !== 409 || resolution.error !== 'Contact CRM identity mismatch') {
    throw new Error('360 identity mismatch did not fail closed');
  }
});

Deno.test('contact lookup rejects an invalid lookup before reading data', async () => {
  let touched = false;
  const resolution = await resolveContactLookup(
    { contactId: CONTACT_ID, lookup: 'raw' },
    lookupDeps({ getContact: () => { touched = true; throw new Error('must not run'); } }),
  );
  if (resolution.ok || resolution.status !== 400 || touched) {
    throw new Error('invalid lookup reached a dependency');
  }
});

Deno.test('contact lookup rejects a UTF-8 response larger than 512 KB', async () => {
  try {
    await resolveContactLookup(
      { contactId: CONTACT_ID, lookup: 'sidebar' },
      lookupDeps({
        getStableLink: () => Promise.resolve({ data: null, error: null }),
        callRpc: () => Promise.resolve({ data: { found: false, payload: 'ç'.repeat(300_000) }, error: null }),
      }),
    );
    throw new Error('oversized response was accepted');
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'CRM_RESPONSE_TOO_LARGE') throw error;
  }
});

const LINKED_CONTACT_ID = '33333333-4444-4555-8666-777777777777';
const FREE_CONTACT_ID = '55555555-6666-4777-8888-999999999999';
const OTHER_EXTERNAL_ID = 'cccccccc-dddd-4eee-8fff-000000000000';
const LINKED_PHONE = '5511988881111';
const FREE_PHONE = '5511977772222';

function batchDeps(overrides: Record<string, unknown> = {}) {
  return {
    listContacts: () => Promise.resolve({
      data: [
        { id: LINKED_CONTACT_ID, phone: '+55 (11) 98888-1111' },
        { id: FREE_CONTACT_ID, phone: '+55 (11) 97777-2222' },
      ],
      error: null,
    }),
    listStableLinks: () => Promise.resolve({
      data: [
        { zapp_contact_id: LINKED_CONTACT_ID, normalized_phone: LINKED_PHONE, external_contact_id: EXTERNAL_ID },
      ],
      error: null,
    }),
    listExternalPhones: () => Promise.resolve({
      data: [{ contact_id: EXTERNAL_ID, numero_e164: `+${LINKED_PHONE}` }],
      error: null,
    }),
    callCompaniesBatch: (phones: string[]) => Promise.resolve({
      data: Object.fromEntries(phones.map((phone) => [phone, { company: { name: `Empresa ${phone}` } }])),
      error: null,
    }),
    ...overrides,
  };
}

Deno.test('batch projects a linked phone only after the external CRM proves the link identity', async () => {
  let proofPhones: string[] = [];
  let sentPhones: string[] = [];
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listExternalPhones: (phones: string[]) => {
      proofPhones = phones;
      return Promise.resolve({ data: [{ contact_id: EXTERNAL_ID, numero_e164: `+${LINKED_PHONE}` }], error: null });
    },
    callCompaniesBatch: (phones: string[]) => {
      sentPhones = phones;
      return Promise.resolve({
        data: Object.fromEntries(phones.map((phone) => [phone, { company: { name: `Empresa ${phone}` } }])),
        error: null,
      });
    },
  }));
  if (!proofPhones.includes(LINKED_PHONE)) throw new Error('linked phone was not sent to the identity proof');
  if (!sentPhones.includes(LINKED_PHONE) || !sentPhones.includes(FREE_PHONE)) {
    throw new Error('proven linked phone or unlinked phone missing from the batch RPC');
  }
  if (!(LINKED_PHONE in data) || !(FREE_PHONE in data)) {
    throw new Error('proven linked phone or unlinked phone missing from the projection');
  }
});

Deno.test('batch drops a linked phone when contact_phones points to another external contact', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listExternalPhones: () => Promise.resolve({
      data: [{ contact_id: OTHER_EXTERNAL_ID, numero_e164: LINKED_PHONE }],
      error: null,
    }),
  }));
  if (LINKED_PHONE in data) throw new Error('divergent linked phone received another person data');
  if (!(FREE_PHONE in data)) throw new Error('unlinked phone lost its projection');
});

Deno.test('batch drops a linked phone absent from contact_phones', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listExternalPhones: () => Promise.resolve({ data: [], error: null }),
  }));
  if (LINKED_PHONE in data) throw new Error('recycled linked phone received data without proof');
  if (!(FREE_PHONE in data)) throw new Error('unlinked phone lost its projection');
});

Deno.test('batch drops a linked phone with ambiguous external ownership', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listExternalPhones: () => Promise.resolve({
      data: [
        { contact_id: EXTERNAL_ID, numero_e164: LINKED_PHONE },
        { contact_id: OTHER_EXTERNAL_ID, numero_e164: LINKED_PHONE },
      ],
      error: null,
    }),
  }));
  if (LINKED_PHONE in data) throw new Error('ambiguous linked phone received data');
  if (!(FREE_PHONE in data)) throw new Error('unlinked phone lost its projection');
});

Deno.test('batch drops a linked phone when the external identity proof cannot be read', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listExternalPhones: () => Promise.resolve({ data: null, error: { code: 'PGRST500' } }),
  }));
  if (LINKED_PHONE in data) throw new Error('linked phone received data after a proof read error');
  if (!(FREE_PHONE in data)) throw new Error('unlinked phone lost its projection');
});

Deno.test('batch drops a contact whose phone no longer matches the stable link', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listStableLinks: () => Promise.resolve({
      data: [{ zapp_contact_id: LINKED_CONTACT_ID, normalized_phone: '5511900000000', external_contact_id: EXTERNAL_ID }],
      error: null,
    }),
  }));
  if (LINKED_PHONE in data) throw new Error('phone divergent from the stable link received data');
  if (!(FREE_PHONE in data)) throw new Error('unlinked phone lost its projection');
});

Deno.test('batch drops a shared phone that also belongs to a linked contact', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listContacts: () => Promise.resolve({
      data: [
        { id: LINKED_CONTACT_ID, phone: '+55 (11) 98888-1111' },
        { id: FREE_CONTACT_ID, phone: '+55 (11) 98888-1111' },
      ],
      error: null,
    }),
    listExternalPhones: () => Promise.resolve({
      data: [{ contact_id: OTHER_EXTERNAL_ID, numero_e164: LINKED_PHONE }],
      error: null,
    }),
  }));
  if (LINKED_PHONE in data) throw new Error('shared phone was released through the unlinked path despite a divergent link');
});

Deno.test('batch drops a phone whose link row has a null external_contact_id', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listStableLinks: () => Promise.resolve({
      data: [{ zapp_contact_id: LINKED_CONTACT_ID, normalized_phone: LINKED_PHONE, external_contact_id: null }],
      error: null,
    }),
  }));
  if (LINKED_PHONE in data) throw new Error('phone bound to a null external_contact_id link received data');
  if (!(FREE_PHONE in data)) throw new Error('unlinked phone lost its projection');
});

Deno.test('batch releases a shared phone only when the link identity is proven', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listContacts: () => Promise.resolve({
      data: [
        { id: LINKED_CONTACT_ID, phone: '+55 (11) 98888-1111' },
        { id: FREE_CONTACT_ID, phone: '+55 (11) 98888-1111' },
      ],
      error: null,
    }),
  }));
  if (!(LINKED_PHONE in data)) throw new Error('proven shared phone lost its projection');
});

Deno.test('batch keeps a phone out when another link row for it is divergent', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listContacts: () => Promise.resolve({
      data: [
        { id: LINKED_CONTACT_ID, phone: '+55 (11) 98888-1111' },
        { id: FREE_CONTACT_ID, phone: '+55 (11) 98888-1111' },
      ],
      error: null,
    }),
    listStableLinks: () => Promise.resolve({
      data: [
        { zapp_contact_id: LINKED_CONTACT_ID, normalized_phone: '5511900000000', external_contact_id: EXTERNAL_ID },
        { zapp_contact_id: FREE_CONTACT_ID, normalized_phone: LINKED_PHONE, external_contact_id: OTHER_EXTERNAL_ID },
      ],
      error: null,
    }),
    listExternalPhones: () => Promise.resolve({
      data: [{ contact_id: OTHER_EXTERNAL_ID, numero_e164: LINKED_PHONE }],
      error: null,
    }),
  }));
  if (LINKED_PHONE in data) throw new Error('phone proven for one link was released despite a divergent link row');
});

Deno.test('batch keeps a phone out when another link row for it has a null external_contact_id', async () => {
  const data = await resolveContactLookupBatch([LINKED_CONTACT_ID, FREE_CONTACT_ID], batchDeps({
    listContacts: () => Promise.resolve({
      data: [
        { id: LINKED_CONTACT_ID, phone: '+55 (11) 98888-1111' },
        { id: FREE_CONTACT_ID, phone: '+55 (11) 98888-1111' },
      ],
      error: null,
    }),
    listStableLinks: () => Promise.resolve({
      data: [
        { zapp_contact_id: LINKED_CONTACT_ID, normalized_phone: LINKED_PHONE, external_contact_id: null },
        { zapp_contact_id: FREE_CONTACT_ID, normalized_phone: LINKED_PHONE, external_contact_id: OTHER_EXTERNAL_ID },
      ],
      error: null,
    }),
    listExternalPhones: () => Promise.resolve({
      data: [{ contact_id: OTHER_EXTERNAL_ID, numero_e164: LINKED_PHONE }],
      error: null,
    }),
  }));
  if (LINKED_PHONE in data) throw new Error('phone proven for one link was released despite a null external_contact_id link row');
});

Deno.test('derives the external participant without treating the active Gmail account as the contact', () => {
  const participant = externalParticipantEmail([
    { from_address: 'agent@example.com', to_addresses: ['other@example.com'], cc_addresses: [], direction: 'outbound' },
    { from_address: 'customer@example.com', to_addresses: ['agent@example.com'], cc_addresses: [], direction: 'inbound' },
  ], 'agent@example.com');
  if (participant !== 'customer@example.com') throw new Error(`expected customer@example.com, got ${participant}`);
});

Deno.test('keeps the first external participant when a later reply-all sender appears', () => {
  const participant = externalParticipantEmail([
    { from_address: 'owner@example.com', to_addresses: ['agent@example.com'], cc_addresses: [], direction: 'inbound' },
    { from_address: 'copied@example.com', to_addresses: ['agent@example.com'], cc_addresses: [], direction: 'inbound' },
  ], 'agent@example.com');
  if (participant !== 'owner@example.com') throw new Error(`expected owner@example.com, got ${participant}`);
});

Deno.test('escapes SQL pattern characters before exact insensitive email lookup', () => {
  if (escapeIlikeExact('person_%@example.com') !== 'person\\_\\%@example.com') throw new Error('email wildcard was not escaped');
});

Deno.test('projects only social networks accepted by the Email company contract', () => {
  const socials = emailCompanySocials([
    { plataforma: 'linkedin', url: 'https://linkedin.example/acme' },
    { plataforma: 'Facebook', url: 'https://facebook.example/acme' },
    { plataforma: 'instagram', url: 'https://instagram.example/acme' },
  ]);
  if (JSON.stringify(socials) !== JSON.stringify([
    { platform: 'linkedin', url: 'https://linkedin.example/acme' },
    { platform: 'instagram', url: 'https://instagram.example/acme' },
  ])) throw new Error('unsupported CRM social network escaped the Email projection');
});

Deno.test('rejects anonymous request before consuming its body', async () => {
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.set('SUPABASE_URL', 'https://tnnnlkbymytvtqngbbqh.supabase.co');
  const response = await handleCRMIntegrationRequest(new Request('https://edge.invalid', {
    method: 'POST', body: 'not-json',
  }));
  assertStatus(response.status, 401);
});

Deno.test('rejects declared oversized body before external configuration', async () => {
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.set('SUPABASE_URL', 'https://tnnnlkbymytvtqngbbqh.supabase.co');
  const response = await handleCRMIntegrationRequest(new Request('https://edge.invalid', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-service-key', 'content-length': '65537' },
    body: '{}',
  }));
  assertStatus(response.status, 413);
});

Deno.test('service credential cannot drive the sidebar contact lookup', async () => {
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.set('SUPABASE_URL', 'https://tnnnlkbymytvtqngbbqh.supabase.co');
  Deno.env.set('EXTERNAL_SUPABASE_URL', 'https://pgxfvjmuubtbowutlide.supabase.co');
  const payload = btoa(JSON.stringify({ ref: 'pgxfvjmuubtbowutlide', role: 'service_role' })).replace(/=/g, '');
  Deno.env.set('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY', `header.${payload}.signature`);
  const response = await handleCRMIntegrationRequest(new Request('https://edge.invalid', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-service-key', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'contactLookup', contactId: crypto.randomUUID(), lookup: 'sidebar' }),
  }));
  assertStatus(response.status, 400);
});

Deno.test('cron credential is scoped to worker and health actions', async () => {
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.set('SUPABASE_URL', 'https://tnnnlkbymytvtqngbbqh.supabase.co');
  Deno.env.set('CRON_SECRET', 'test-cron-secret');
  const response = await handleCRMIntegrationRequest(new Request('https://edge.invalid', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': 'test-cron-secret' },
    body: JSON.stringify({ action: 'rpc', rpc: 'get_contact_360_by_phone', params: { p_phone: '5511999990000' } }),
  }));
  assertStatus(response.status, 403);
});

Deno.test('service credential cannot drive the scoped Email company context', async () => {
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.set('SUPABASE_URL', 'https://tnnnlkbymytvtqngbbqh.supabase.co');
  Deno.env.set('EXTERNAL_SUPABASE_URL', 'https://pgxfvjmuubtbowutlide.supabase.co');
  const payload = btoa(JSON.stringify({ ref: 'pgxfvjmuubtbowutlide', role: 'service_role' })).replace(/=/g, '');
  Deno.env.set('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY', `header.${payload}.signature`);
  const response = await handleCRMIntegrationRequest(new Request('https://edge.invalid', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-service-key', 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'emailContactContext',
      accountId: crypto.randomUUID(), threadId: crypto.randomUUID(), contactId: crypto.randomUUID(),
    }),
  }));
  assertStatus(response.status, 400);
});

// ── ES-04/ES-45 · matriz de permissões do vínculo empresa↔contato ──────────────
//
// O cenário "Atendente negado" da matriz OTH-013 registrava a pendência de um
// teste que exercesse os STATUS HTTP do vínculo manual: o teste do hook prova só
// o estado seguro do front, não o que o navegador recebe da fronteira do
// servidor. Aqui o HANDLER REAL (`handleCRMIntegrationRequest`) é dirigido com um
// atendente SINTÉTICO e a rede dublada na fronteira (`globalThis.fetch`) — sem
// banco, sem produção e sem credencial real —, no mesmo caminho que a Edge
// percorre em produção, até o status HTTP da resposta.

const LINK_USER_ID = '90000000-0000-4000-8000-000000000001';
const LINK_THREAD_ID = '91000000-0000-4000-8000-000000000002';
const LINK_ACCOUNT_ID = '92000000-0000-4000-8000-000000000003';
const LINK_OTHER_ACCOUNT_ID = '93000000-0000-4000-8000-000000000004';
const LINK_CONTACT_ID = '94000000-0000-4000-8000-000000000005';

interface LinkRoute { match: string; body: unknown; status?: number }

/**
 * Dubla a FRONTEIRA de rede (nunca o alvo): casa a rota pelo PATH exato, para
 * `https://evil.invalid/rest/v1/contacts` não contar como o PostgREST do projeto.
 * Requisição sem rota vira 599 e fica registrada em `seen` — assim o teste
 * enxerga qualquer leitura que não deveria ter acontecido.
 */
function withLinkFetch(routes: LinkRoute[]) {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const parsed = new URL(url);
    // R2-AUTH-022: `requireAuth` consulta a política de rede (RPC service_role)
    // antes de liberar o handler; o stub responde "allow" no caminho feliz.
    if (parsed.pathname === '/rest/v1/rpc/resolve_network_policy') {
      seen.push(url);
      return Promise.resolve(new Response(JSON.stringify([
        { allowed: true, reason: null, rate_limit_max_requests: 30, rate_limit_window_seconds: 60 },
      ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    // R2-AUTH-004: `requireAuth` lê `profiles.is_active` por `user_id` (igualdade
    // exata) antes de liberar o handler; o stub responde "ativo" no caminho feliz.
    if (url.includes('/rest/v1/profiles') && url.includes('select=is_active')) {
      seen.push(url);
      return Promise.resolve(new Response(JSON.stringify({ is_active: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    }
    const route = routes.find((candidate) => candidate.match === parsed.pathname);
    if (!route) {
      seen.push(url);
      return Promise.resolve(new Response('nao stubado', { status: 599 }));
    }
    seen.push(url);
    return Promise.resolve(new Response(JSON.stringify(route.body), {
      status: route.status ?? 200, headers: { 'content-type': 'application/json' },
    }));
  }) as typeof fetch;
  return { seen, restore: () => { globalThis.fetch = original; } };
}

const LINK_ENV: Record<string, string> = {
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-de-teste',
  SUPABASE_ANON_KEY: 'chave-anon-de-teste',
  EXTERNAL_SUPABASE_URL: 'https://pgxfvjmuubtbowutlide.supabase.co',
  EXTERNAL_SUPABASE_SERVICE_ROLE_KEY:
    `header.${btoa(JSON.stringify({ ref: 'pgxfvjmuubtbowutlide', role: 'service_role' })).replace(/=/g, '')}.assinatura`,
};

/** Credencial sintética: token de atendente que NÃO é o do serviço nem o do cron. */
async function withLinkEnv(fn: () => Promise<void>) {
  const saved = Object.keys(LINK_ENV).map((key) => [key, Deno.env.get(key)] as const);
  const cronSecret = Deno.env.get('CRON_SECRET');
  for (const [key, value] of Object.entries(LINK_ENV)) Deno.env.set(key, value);
  Deno.env.delete('CRON_SECRET');
  try {
    await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    if (cronSecret !== undefined) Deno.env.set('CRON_SECRET', cronSecret);
  }
}

const LINK_ROTA_AUTH: LinkRoute = { match: '/auth/v1/user', body: { id: LINK_USER_ID, aud: 'authenticated' } };
const LINK_ROTA_RATE: LinkRoute = { match: '/rest/v1/rpc/consume_rate_limit', body: { allowed: true, remaining: 59 } };
const LINK_ROTA_FLAG: LinkRoute = { match: '/rest/v1/feature_flags', body: { enabled: true } };
const LINK_ROTA_THREAD: LinkRoute = {
  match: '/rest/v1/email_threads',
  body: { id: LINK_THREAD_ID, gmail_account_id: LINK_ACCOUNT_ID, contact_id: LINK_CONTACT_ID },
};
const LINK_ROTA_CONTA: LinkRoute = {
  match: '/rest/v1/gmail_accounts',
  body: { id: LINK_ACCOUNT_ID, email_address: 'atendimento@zapp.local' },
};
const LINK_ROTA_CONTATO: LinkRoute = { match: '/rest/v1/contacts', body: { id: LINK_CONTACT_ID, phone: '+55 (11) 98888-1111' } };
const LINK_ROTA_MENSAGENS: LinkRoute = { match: '/rest/v1/email_messages', body: [] };

const LINK_PERMISSAO_NEGADA: LinkRoute = { match: '/rest/v1/rpc/user_has_permission', body: false };
const LINK_PERMISSAO_CONCEDIDA: LinkRoute = { match: '/rest/v1/rpc/user_has_permission', body: true };

function linkRequest(): Request {
  return new Request('https://stub.supabase.co/functions/v1/crm-integration', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer token-sintetico-do-atendente' },
    body: JSON.stringify({
      action: 'linkEmailContactCompany',
      accountId: LINK_ACCOUNT_ID, threadId: LINK_THREAD_ID, externalContactId: 'contato-externo-1',
    }),
  });
}

Deno.test('matriz de permissões: atendente SEM a permissão nomeada recebe 403 mesmo com thread, conta e contato visíveis', async () => {
  await withLinkEnv(async () => {
    // A thread, a conta e o contato desta fixture EXISTEM — o pedido idêntico
    // com a permissão concedida passa da visibilidade (teste logo abaixo).
    const stub = withLinkFetch([
      LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_ROTA_FLAG, LINK_PERMISSAO_NEGADA,
      LINK_ROTA_THREAD, LINK_ROTA_CONTA, LINK_ROTA_CONTATO,
    ]);
    try {
      const response = await handleCRMIntegrationRequest(linkRequest());
      assertStatus(response.status, 403);
      const body = await response.json() as { error?: string };
      if (body.error !== 'You do not have permission to link CRM companies') {
        throw new Error(`403 com motivo inesperado: ${JSON.stringify(body)}`);
      }
      // "Proibido" tem de ser distinguível de "não existe": sem a permissão a
      // Edge responde ANTES de ler o objeto protegido, para o atendente negado
      // não descobrir pelo 404 que a thread/conta/contato existem.
      const leituras = stub.seen.filter((url) => /email_threads|gmail_accounts|\/rest\/v1\/contacts/.test(url));
      if (leituras.length > 0) throw new Error(`sem permissão a Edge não pode ler o objeto protegido: ${leituras.join(', ')}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test('matriz de permissões: o mesmo pedido com a permissão concedida passa da visibilidade (o objeto protegido existe)', async () => {
  await withLinkEnv(async () => {
    const stub = withLinkFetch([
      LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_ROTA_FLAG, LINK_PERMISSAO_CONCEDIDA,
      LINK_ROTA_THREAD, LINK_ROTA_CONTA, LINK_ROTA_CONTATO, LINK_ROTA_MENSAGENS,
    ]);
    try {
      const response = await handleCRMIntegrationRequest(linkRequest());
      // Sem participante externo nas mensagens a Edge para em 409. O que este
      // teste prova é a NEGAÇÃO da negação: a mesma fixture não recebe 403 nem
      // 404, ou seja, thread/conta/contato são visíveis ao atendente autorizado
      // — é a contraprova que torna o 403 do teste anterior "existe e é negado".
      assertStatus(response.status, 409);
      const body = await response.json() as { error?: string };
      if (body.error !== 'External email participant is unavailable') {
        throw new Error(`esperado 409 de participante ausente, veio: ${JSON.stringify(body)}`);
      }
    } finally {
      stub.restore();
    }
  });
});

Deno.test('matriz de permissões: atendente AUTORIZADO recebe 404 quando a thread não pertence à conta informada', async () => {
  await withLinkEnv(async () => {
    const stub = withLinkFetch([
      LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_ROTA_FLAG, LINK_PERMISSAO_CONCEDIDA,
      { match: '/rest/v1/email_threads', body: { id: LINK_THREAD_ID, gmail_account_id: LINK_OTHER_ACCOUNT_ID, contact_id: LINK_CONTACT_ID } },
      LINK_ROTA_CONTA, LINK_ROTA_CONTATO, LINK_ROTA_MENSAGENS,
    ]);
    try {
      const response = await handleCRMIntegrationRequest(linkRequest());
      assertStatus(response.status, 404);
      const body = await response.json() as { error?: string };
      if (body.error !== 'Email contact context is not visible') {
        throw new Error(`404 com motivo inesperado: ${JSON.stringify(body)}`);
      }
    } finally {
      stub.restore();
    }
  });
});

Deno.test('matriz de permissões: atendente AUTORIZADO recebe 404 quando o contato da thread não é visível', async () => {
  await withLinkEnv(async () => {
    const stub = withLinkFetch([
      LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_ROTA_FLAG, LINK_PERMISSAO_CONCEDIDA,
      LINK_ROTA_THREAD, LINK_ROTA_CONTA,
      { match: '/rest/v1/contacts', body: null }, LINK_ROTA_MENSAGENS,
    ]);
    try {
      const response = await handleCRMIntegrationRequest(linkRequest());
      assertStatus(response.status, 404);
      const body = await response.json() as { error?: string };
      if (body.error !== 'Email contact context is not visible') {
        throw new Error(`404 com motivo inesperado: ${JSON.stringify(body)}`);
      }
    } finally {
      stub.restore();
    }
  });
});

Deno.test('matriz de permissões: sem permissão a resposta é 403 e não 404 para thread inexistente (não vaza existência)', async () => {
  await withLinkEnv(async () => {
    const stub = withLinkFetch([
      LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_ROTA_FLAG, LINK_PERMISSAO_NEGADA,
      { match: '/rest/v1/email_threads', body: null }, { match: '/rest/v1/gmail_accounts', body: null },
    ]);
    try {
      const response = await handleCRMIntegrationRequest(linkRequest());
      // O mesmo pedido sem permissão responde IGUAL para thread visível e para
      // thread inexistente: o status não revela quais objetos existem.
      assertStatus(response.status, 403);
    } finally {
      stub.restore();
    }
  });
});

// ── PM-38 · sugestões estreitas de empresa e cargo (formulário de contato) ────
//
// O formulário pede as sugestões de EMPRESA e CARGO. A ação antiga
// (`rpc`→`search_contacts_advanced`) é admin-only e devolve LINHAS de contato
// inteiras só para extrair um texto: o atendente recebia 403 e o supervisor
// pagava dezenas de páginas. A ação estreita responde SÓ strings distintas sob
// `view_contacts`. Estes testes dirigem o HANDLER REAL por papel — atendente
// com/sem permissão e credencial de serviço —, com a rede dublada na fronteira.

const NAMES_ROTA_EMPRESAS: LinkRoute = {
  match: '/rest/v1/companies',
  body: [
    { nome_fantasia: 'ACME', nome_crm: 'ACME LTDA', razao_social: 'ACME LTDA' },
    { nome_fantasia: null, nome_crm: 'Beta', razao_social: 'Beta ME' },
    { nome_fantasia: '  ACME  ', nome_crm: null, razao_social: null },
    { nome_fantasia: 'Gama', nome_crm: null, razao_social: null },
  ],
};
const NAMES_ROTA_CARGOS: LinkRoute = {
  match: '/rest/v1/contacts',
  body: [
    { cargo: 'Vendedor' }, { cargo: 'Gerente' }, { cargo: ' Vendedor ' }, { cargo: null }, { cargo: '' },
  ],
};

function namesRequest(action: string): Request {
  return new Request('https://stub.supabase.co/functions/v1/crm-integration', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer token-sintetico-do-atendente' },
    body: JSON.stringify({ action }),
  });
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value as string[] : null;
}

Deno.test('sugestões: atendente SEM view_contacts recebe 403 e o CRM externo não é lido', async () => {
  await withLinkEnv(async () => {
    const stub = withLinkFetch([LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_PERMISSAO_NEGADA]);
    try {
      const response = await handleCRMIntegrationRequest(namesRequest('companyNames'));
      assertStatus(response.status, 403);
      const leituras = stub.seen.filter((url) => /companies|salespeople|\/rest\/v1\/contacts/.test(url));
      if (leituras.length > 0) throw new Error(`sem permissão a Edge não pode ler o CRM: ${leituras.join(', ')}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test('sugestões de empresa: atendente COM view_contacts recebe só strings distintas, sem linha de contato', async () => {
  await withLinkEnv(async () => {
    const stub = withLinkFetch([LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_PERMISSAO_CONCEDIDA, NAMES_ROTA_EMPRESAS]);
    try {
      const response = await handleCRMIntegrationRequest(namesRequest('companyNames'));
      assertStatus(response.status, 200);
      const raw = await response.text();
      const body = JSON.parse(raw) as { data?: unknown };
      const nomes = stringList(body.data);
      if (!nomes) throw new Error(`a resposta não é uma lista de strings: ${raw}`);
      if (JSON.stringify([...nomes].sort()) !== JSON.stringify(['ACME', 'Beta', 'Gama'])) {
        throw new Error(`nomes inesperados (dedupe/trim/vazio): ${JSON.stringify(nomes)}`);
      }
      if (/phone|telefone|contato/i.test(raw)) throw new Error('a resposta vazou campo de contato');
      const contatos = stub.seen.filter((url) => /\/rest\/v1\/contacts/.test(url));
      if (contatos.length > 0) throw new Error(`a sugestão não pode ler contatos: ${contatos.join(', ')}`);
    } finally {
      stub.restore();
    }
  });
});

Deno.test('sugestões de cargo: lê contacts.cargo (não salespeople.role) e devolve só strings, sem linha de contato', async () => {
  await withLinkEnv(async () => {
    const stub = withLinkFetch([LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_PERMISSAO_CONCEDIDA, NAMES_ROTA_CARGOS]);
    try {
      const response = await handleCRMIntegrationRequest(namesRequest('roleNames'));
      assertStatus(response.status, 200);
      const raw = await response.text();
      const body = JSON.parse(raw) as { data?: unknown };
      const cargos = stringList(body.data);
      if (!cargos) throw new Error(`a resposta não é uma lista de strings: ${raw}`);
      if (JSON.stringify([...cargos].sort()) !== JSON.stringify(['Gerente', 'Vendedor'])) {
        throw new Error(`cargos inesperados (dedupe/trim/vazio): ${JSON.stringify(cargos)}`);
      }
      const leituras = stub.seen.filter((url) => /\/rest\/v1\/(contacts|salespeople)/.test(url));
      if (leituras.length === 0) throw new Error('a ação de cargo não leu o CRM externo');
      if (leituras.some((url) => /salespeople/.test(url))) {
        throw new Error(`a ação de cargo ainda lê salespeople: ${leituras.join(', ')}`);
      }
      // A leitura é estreita: só `cargo`, nunca nome/telefone/e-mail do contato.
      if (!leituras.some((url) => /select=cargo(&|$)/.test(decodeURIComponent(url)))) {
        throw new Error(`a leitura não pediu só cargo: ${leituras.join(', ')}`);
      }
      if (leituras.some((url) => /name|phone|email|telefone/i.test(decodeURIComponent(url)))) {
        throw new Error(`a leitura pediu coluna de contato: ${leituras.join(', ')}`);
      }
    } finally {
      stub.restore();
    }
  });
});

Deno.test('sugestões de cargo: credencial de cron não pode ler as sugestões', async () => {
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  Deno.env.set('SUPABASE_URL', 'https://sb-testref.supabase.co');
  Deno.env.set('CRON_SECRET', 'test-cron-secret');
  const response = await handleCRMIntegrationRequest(new Request('https://edge.invalid', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': 'test-cron-secret' },
    body: JSON.stringify({ action: 'roleNames' }),
  }));
  assertStatus(response.status, 403);
});

Deno.test('sugestões: credencial de serviço não pode ler as sugestões', async () => {
  await withLinkEnv(async () => {
    const response = await handleCRMIntegrationRequest(new Request('https://stub.supabase.co/functions/v1/crm-integration', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${LINK_ENV.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ action: 'roleNames' }),
    }));
    assertStatus(response.status, 400);
  });
});

Deno.test('sugestões: parâmetro extra é recusado para a leitura estreita não virar o `select` genérico', async () => {
  await withLinkEnv(async () => {
    const stub = withLinkFetch([LINK_ROTA_AUTH, LINK_ROTA_RATE, LINK_PERMISSAO_CONCEDIDA, NAMES_ROTA_CARGOS]);
    try {
      const response = await handleCRMIntegrationRequest(new Request('https://stub.supabase.co/functions/v1/crm-integration', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer token-sintetico-do-atendente' },
        body: JSON.stringify({ action: 'roleNames', table: 'contacts' }),
      }));
      assertStatus(response.status, 400);
    } finally {
      stub.restore();
    }
  });
});

Deno.test('sugestões: projeção deduplica, descarta vazio e respeita o teto (nunca devolve objeto)', () => {
  const cargos = distinctNameSuggestions(
    [{ role: 'A' }, { role: ' A ' }, { role: '' }, { role: null }, { role: 'B' }],
    (row) => row.role,
  );
  if (JSON.stringify([...cargos].sort()) !== JSON.stringify(['A', 'B'])) {
    throw new Error(`dedupe/trim/vazio falhou: ${JSON.stringify(cargos)}`);
  }
  const muitos = Array.from({ length: MAX_NAME_SUGGESTIONS + 25 }, (_, index) => ({ role: `Cargo ${index}` }));
  const cortado = distinctNameSuggestions(muitos, (row) => row.role);
  if (cortado.length !== MAX_NAME_SUGGESTIONS) throw new Error(`o teto não foi respeitado: ${cortado.length}`);
  if (!cortado.every((item) => typeof item === 'string')) throw new Error('a projeção devolveu algo que não é string');
});

Deno.test('sugestões: nome da empresa usa fantasia → CRM → razão, sem campo vazio', () => {
  const nomes = distinctCompanyNames([
    { nome_fantasia: '', nome_crm: 'Só CRM', razao_social: 'Razao' },
    { nome_fantasia: null, nome_crm: null, razao_social: 'Só Razao' },
    { nome_fantasia: '   ', nome_crm: ' ', razao_social: '   ' },
  ]);
  if (JSON.stringify([...nomes].sort()) !== JSON.stringify(['Só CRM', 'Só Razao'])) {
    throw new Error(`prioridade de nome falhou: ${JSON.stringify(nomes)}`);
  }
});
