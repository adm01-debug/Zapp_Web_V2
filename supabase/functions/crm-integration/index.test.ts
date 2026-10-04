import { emailCompanySocials, escapeIlikeExact, externalParticipantEmail, handleCRMIntegrationRequest } from './index.ts';

function assertStatus(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`expected HTTP ${expected}, got ${actual}`);
}

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
