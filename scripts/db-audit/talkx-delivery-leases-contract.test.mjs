import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../../supabase/migrations/20260911130000_add_talkx_recipient_delivery_leases.sql', import.meta.url), 'utf8');
const edgeFunction = await readFile(new URL('../../supabase/functions/talkx-send/index.ts', import.meta.url), 'utf8');

test('Talk X leases are service-role-only and fence claim completion', () => {
  assert.match(migration, /FOR UPDATE OF recipient SKIP LOCKED/i);
  assert.match(migration, /delivery_claim_token = gen_random_uuid\(\)/i);
  assert.match(migration, /talkx_delivery_claim_conflict/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.claim_talkx_recipient[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.claim_talkx_recipient[\s\S]*TO service_role/i);
  assert.match(migration, /delivery_claim_token = p_claim_token/i);
});

test('talkx-send claims before touching the provider and completes with its lease token', () => {
  const claim = edgeFunction.lastIndexOf('claim_talkx_recipient');
  const provider = edgeFunction.lastIndexOf('/message/sendText/');
  const completion = edgeFunction.lastIndexOf('complete_talkx_recipient');
  assert.ok(claim >= 0 && provider >= 0 && claim < provider, 'claim must precede provider send');
  assert.ok(completion > provider, 'completion must follow provider send');
  assert.match(edgeFunction, /p_claim_token:\s*claim\.claim_token/);
  assert.match(edgeFunction, /transition_talkx_campaign/);
  assert.doesNotMatch(edgeFunction, /\.update\(\{ status: newStatus \}\)/);
});

test('Talk X campaign transition RPC serializes delivery lifecycle changes', async () => {
  const transitionMigration = await readFile(new URL('../../supabase/migrations/20260911150000_add_talkx_campaign_transition_rpc.sql', import.meta.url), 'utf8');
  assert.match(transitionMigration, /FOR UPDATE/i);
  assert.match(transitionMigration, /talkx_campaign_start_denied_from_/i);
  assert.match(transitionMigration, /talkx_campaign_recipients_required/i);
  assert.match(transitionMigration, /REVOKE ALL ON FUNCTION public\.transition_talkx_campaign[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(transitionMigration, /GRANT EXECUTE ON FUNCTION public\.transition_talkx_campaign[\s\S]*TO service_role/i);
});
