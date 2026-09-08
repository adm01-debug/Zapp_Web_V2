import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const foundation = await readFile(
  new URL('../../supabase/migrations/20260908180000_crm_contact_links_and_sync_outbox.sql', import.meta.url),
  'utf8',
);
const hardening = await readFile(
  new URL('../../supabase/migrations/20260908220000_harden_crm_sync_outbox_leases.sql', import.meta.url),
  'utf8',
);
const migration = `${foundation}\n${hardening}`;

test('outbox is idempotent per closure and uses stable external identity links', () => {
  assert.match(migration, /idempotency_key text NOT NULL UNIQUE/i);
  assert.match(migration, /UNIQUE \(closure_id\)/i);
  assert.match(migration, /UNIQUE \(zapp_contact_id\)/i);
  assert.match(migration, /external_contact_id text NOT NULL/i);
});

test('claim is concurrent-safe and recovers stale locks', () => {
  assert.match(migration, /FOR UPDATE SKIP LOCKED/i);
  assert.match(migration, /status = 'processing' AND locked_at < now\(\) - interval '5 minutes'/i);
  assert.match(migration, /locked_at < now\(\) - interval '5 minutes'/i);
  assert.match(migration, /attempt_count < max_attempts/i);
  assert.match(hardening, /lease_token = gen_random_uuid\(\)/i);
  assert.doesNotMatch(hardening, /attempt_count < (?:q\.)?max_attempts OR (?:q\.)?status = 'processing'/i);
  assert.match(hardening, /LEASE_EXPIRED_MAX_ATTEMPTS/i);
});

test('failures back off and eventually enter dead letter', () => {
  assert.match(migration, /THEN 'dead_letter' ELSE 'failed'/i);
  assert.match(migration, /power\(2,/i);
  assert.match(migration, /LEAST\(3600,/i);
});

test('completion and failure reject lost state transitions', () => {
  assert.equal((hardening.match(/GET DIAGNOSTICS v_rows = ROW_COUNT/gi) || []).length, 2);
  assert.equal((hardening.match(/lease_token = p_lease_token/gi) || []).length, 2);
  assert.equal((hardening.match(/RAISE EXCEPTION 'crm_sync_outbox_lease_lost'/gi) || []).length, 2);
});

test('queue mutation RPCs are service-role only', () => {
  for (const name of ['claim_crm_sync_outbox', 'claim_crm_sync_outbox_by_id', 'complete_crm_sync_outbox', 'fail_crm_sync_outbox']) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[^;]+ TO service_role`, 's'));
  }
  assert.match(migration, /ALTER TABLE public\.crm_sync_outbox ENABLE ROW LEVEL SECURITY/i);
});

test('health metrics are aggregate-only and admin/service protected', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_crm_sync_health\(\)/i);
  assert.match(migration, /auth\.role\(\) <> 'service_role'/i);
  assert.match(migration, /public\.is_admin_or_supervisor\(auth\.uid\(\)\)/i);
  assert.match(migration, /'dead_letter'/i);
  assert.match(migration, /'oldest_ready_age_seconds'/i);
  assert.match(migration, /'succeeded_without_link'/i);
  assert.match(hardening, /FUNCTION public\.get_crm_sync_health\(\)\s*RETURNS jsonb/i);
});

test('closure trigger stores no full message transcript', () => {
  assert.match(migration, /AFTER INSERT ON public\.conversation_closures/i);
  assert.doesNotMatch(migration, /FROM public\.messages/i);
});

test('hardening preserves audit rows and fails closed on missing claims', () => {
  assert.match(hardening, /ON DELETE SET NULL/i);
  assert.match(hardening, /COALESCE\(auth\.role\(\), ''\) <> 'service_role'/i);
  assert.match(hardening, /COALESCE\(public\.is_admin_or_supervisor\(auth\.uid\(\)\), false\) IS NOT TRUE/i);
  assert.match(hardening, /status = 'dead_letter'.+last_error_code/s);
  assert.match(hardening, /octet_length\(payload::text\) <= 20000/i);
});
