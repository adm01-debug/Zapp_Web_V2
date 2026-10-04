import { emailCompanySocials, escapeIlikeExact, externalParticipantEmail, handleCRMIntegrationRequest, resolveContactLookup } from './index.ts';

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
