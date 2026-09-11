import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../../supabase/migrations/20260911130000_add_talkx_recipient_delivery_leases.sql', import.meta.url), 'utf8');
const completionMigration = await readFile(new URL('../../supabase/migrations/20260911170000_add_talkx_campaign_completion_rpc.sql', import.meta.url), 'utf8');
const quarantineMigration = await readFile(new URL('../../supabase/migrations/20260911180000_quarantine_talkx_unknown_provider_outcomes.sql', import.meta.url), 'utf8');
const outcomeCounterMigration = await readFile(new URL('../../supabase/migrations/20260911190000_account_for_talkx_unknown_provider_outcomes.sql', import.meta.url), 'utf8');
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
  assert.match(edgeFunction, /campaignAction !== "start"/);
  assert.match(edgeFunction, /complete_talkx_campaign_if_drained/);
  assert.match(edgeFunction, /p_status:\s*"outcome_unknown"/);
  assert.match(edgeFunction, /talkx_recipient_quarantine_failed/);
  assert.doesNotMatch(edgeFunction, /fetchWithRetry/);
});

test('ambiguous provider outcomes are terminal and cannot be re-claimed automatically', () => {
  assert.match(quarantineMigration, /'outcome_unknown'/);
  assert.match(quarantineMigration, /p_status NOT IN \('sent', 'failed', 'skipped', 'outcome_unknown'\)/);
  assert.match(quarantineMigration, /REVOKE ALL ON FUNCTION public\.complete_talkx_recipient[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(quarantineMigration, /GRANT EXECUTE ON FUNCTION public\.complete_talkx_recipient[\s\S]*TO service_role/i);
});

test('only the delivery worker can account for quarantined provider outcomes', () => {
  assert.match(outcomeCounterMigration, /ADD COLUMN IF NOT EXISTS outcome_unknown_count integer NOT NULL DEFAULT 0/i);
  assert.match(outcomeCounterMigration, /NEW\.outcome_unknown_count IS DISTINCT FROM OLD\.outcome_unknown_count/i);
  assert.match(outcomeCounterMigration, /outcome_unknown_count = campaign\.outcome_unknown_count \+ CASE WHEN p_status = 'outcome_unknown' THEN 1 ELSE 0 END/i);
});

test('Talk X completion is service-only, locked and requires a drained queue', () => {
  assert.match(completionMigration, /FOR UPDATE/i);
  assert.match(completionMigration, /recipient\.status IN \('pending', 'sending'\)/i);
  assert.match(completionMigration, /status = 'completed'/i);
  assert.match(completionMigration, /REVOKE ALL ON FUNCTION public\.complete_talkx_campaign_if_drained[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(completionMigration, /GRANT EXECUTE ON FUNCTION public\.complete_talkx_campaign_if_drained[\s\S]*TO service_role/i);
});

test('Talk X campaign transition RPC serializes delivery lifecycle changes', async () => {
  const transitionMigration = await readFile(new URL('../../supabase/migrations/20260911150000_add_talkx_campaign_transition_rpc.sql', import.meta.url), 'utf8');
  assert.match(transitionMigration, /FOR UPDATE/i);
  assert.match(transitionMigration, /talkx_campaign_start_denied_from_/i);
  assert.match(transitionMigration, /talkx_campaign_recipients_required/i);
  assert.match(transitionMigration, /REVOKE ALL ON FUNCTION public\.transition_talkx_campaign[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(transitionMigration, /GRANT EXECUTE ON FUNCTION public\.transition_talkx_campaign[\s\S]*TO service_role/i);
});
