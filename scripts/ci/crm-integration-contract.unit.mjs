import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  isExpectedExternalAnonKey, isExpectedExternalServerKey, isExpectedExternalUrl, normalizePhone,
  parseSyncResult, validateMutation, validateRpc,
} from '../../supabase/functions/_shared/crm-integration-contract.ts';

const edgeSource = await readFile(
  new URL('../../supabase/functions/crm-integration/index.ts', import.meta.url),
  'utf8',
);

test('CRM contract rejects foreign endpoints and credentials', () => {
  assert.equal(isExpectedExternalUrl('https://pgxfvjmuubtbowutlide.supabase.co'), true);
  assert.equal(isExpectedExternalUrl('https://pgxfvjmuubtbowutlide.supabase.co.evil.invalid'), false);
  assert.equal(isExpectedExternalUrl('https://pgxfvjmuubtbowutlide.supabase.co:444'), false);
  assert.equal(isExpectedExternalUrl('https://pgxfvjmuubtbowutlide.supabase.co/?x=1'), false);
  const payload = Buffer.from(JSON.stringify({ ref: 'pgxfvjmuubtbowutlide', role: 'anon' })).toString('base64url');
  const foreign = Buffer.from(JSON.stringify({ ref: 'foreign', role: 'service_role' })).toString('base64url');
  assert.equal(isExpectedExternalAnonKey(`x.${payload}.x`), true);
  assert.equal(isExpectedExternalServerKey(`x.${payload}.x`), false);
  assert.equal(isExpectedExternalServerKey(`x.${foreign}.x`), false);
  assert.equal(isExpectedExternalAnonKey(`x.${foreign}.x`), false);
});

test('CRM gateway minimizes message data and authenticates before external configuration', () => {
  assert.match(edgeSource, /p_conteudo:\s*null/);
  assert.doesNotMatch(edgeSource, /payload\.conteudo/);
  assert.ok(edgeSource.indexOf('requireAuth(req)') < edgeSource.indexOf("requireEnv('EXTERNAL_SUPABASE_URL')"));
  assert.match(edgeSource, /userHasPermission\('view_contacts'\)/);
  assert.match(edgeSource, /MAX_REQUEST_BYTES = 64 \* 1024/);
  assert.match(edgeSource, /p_lease_token: row\.lease_token/);
  assert.match(edgeSource, /parseSyncResult\(result\.data\)/);
  assert.match(edgeSource, /AbortSignal\.timeout\(TIMEOUT_MS\)/);
});

test('CRM rejects false-success responses before completing the queue', () => {
  assert.deepEqual(parseSyncResult({ synced: true, interaction_id: 'i1', contact_id: 'c1' }), {
    synced: true, interaction_id: 'i1', contact_id: 'c1', company_id: null,
  });
  for (const value of [{}, [], { synced: false }, { synced: true, contact_id: 'c1' }]) {
    assert.throws(() => parseSyncResult(value), /CRM_/);
  }
});

test('CRM contract bounds identity, batches and mutations', () => {
  assert.equal(normalizePhone('+55 (11) 99999-0000'), '5511999990000');
  assert.ok(validateRpc('get_companies_by_phones_batch', { p_phones: Array(101).fill('5511999990000') }));
  assert.ok(validateRpc('unknown', {}));
  assert.ok(validateRpc('get_contact_360_by_phone', { p_phone: '5511999990000', injected: true }));
  assert.ok(validateRpc('get_contact_360_by_phone', { p_phone: '5'.repeat(1_000_000) }));
  assert.ok(validateRpc('search_contacts_advanced', { p_search: ['x'] }));
  assert.equal(validateMutation('companies', 'insert', { nome_fantasia: 'ACME' }, undefined), null);
  assert.ok(validateMutation('companies', 'update', { owner: 'attacker' }, { id: '1' }));
  assert.ok(validateMutation('contacts', 'insert', { notes: { nested: true } }, undefined));
});
