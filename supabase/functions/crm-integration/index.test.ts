import { handleCRMIntegrationRequest } from './index.ts';

function assertStatus(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`expected HTTP ${expected}, got ${actual}`);
}

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
