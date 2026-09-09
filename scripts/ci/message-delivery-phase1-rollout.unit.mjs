import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260909220000_add_message_delivery_and_atomic_closure_rpcs.sql', import.meta.url),
  'utf8',
);
const executableMigration = migration.replace(/--.*$/gm, '');
const withoutFunctionAcl = executableMigration.replace(
  /REVOKE[\s\S]*?ON\s+FUNCTION[\s\S]*?;/gi,
  '',
);
const dbGuard = readFileSync(
  new URL('../../.github/workflows/db-guard.yml', import.meta.url),
  'utf8',
);
const enqueueBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_outbound_message'),
  migration.indexOf('CREATE OR REPLACE FUNCTION public.claim_outbound_message'),
);
const closeBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.close_conversation_atomic'),
);
const richMigration = readFileSync(
  new URL('../../supabase/migrations/20260909260000_add_atomic_rich_outbound_messages.sql', import.meta.url),
  'utf8',
);
const phoneNormalizationMigration = readFileSync(
  new URL('../../supabase/migrations/20260909270000_normalize_atomic_delivery_phone.sql', import.meta.url),
  'utf8',
);

test('message delivery phase 1 remains additive and deployment-order safe', () => {
  assert.doesNotMatch(executableMigration, /DROP\s+POLICY/i);
  assert.doesNotMatch(withoutFunctionAcl, /REVOKE[\s\S]*?ON\s+(?:TABLE\s+)?public\./i);
  assert.doesNotMatch(executableMigration, /(?:current_setting|set_config)\s*\(\s*['"]app\./i);
  assert.match(migration, /SET LOCAL lock_timeout = '5s'/);
  assert.match(migration, /SET LOCAL statement_timeout = '120s'/);
  assert.match(migration, /ADD COLUMN delivery_last_claim_token uuid/);
  assert.match(migration, /AND delivery_claimed_by IS NOT NULL/);
  assert.match(migration, /CREATE TRIGGER trg_guard_message_delivery_internal_fields/);
  assert.match(migration, /CREATE TRIGGER trg_guard_conversation_closure_request_id/);
  assert.match(migration, /CREATE TRIGGER trg_guard_conversation_event_closure_id/);
  assert.match(migration, /current_user IN \('postgres', 'service_role'\)/);
  assert.match(migration, /delivery_last_claim_token = p_claim_token/);
  assert.match(migration, /p_lease_seconds IS NULL/);
  assert.match(migration, /p_delivery_status IS NULL/);
  assert.match(migration, /p_close_reason IS NULL/);
  assert.match(migration, /v_changed_at := transaction_timestamp\(\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_message/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_outbound_message/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.close_conversation_atomic/);
  assert.ok(
    enqueueBody.indexOf('FOR SHARE') <
      enqueueBody.indexOf('public.is_contact_visible_to_user'),
    'enqueue must lock the contact before evaluating visibility',
  );
  assert.ok(
    closeBody.indexOf('FOR UPDATE') <
      closeBody.indexOf('public.is_contact_visible_to_user'),
    'close must lock the contact before evaluating visibility',
  );
});

test('offline DB guard executes the PostgreSQL 17 behavioral harness', () => {
  assert.match(dbGuard, /message-delivery-phase1-behavior\.test\.sh/);
  assert.match(dbGuard, /MESSAGE_DELIVERY_TEST_POSTGRES_IMAGE:\s*postgres:17-alpine/);
});

test('rich outbound enqueue keeps provider payload immutable and non-service callable', () => {
  assert.match(richMigration, /CREATE OR REPLACE FUNCTION public\.enqueue_rich_outbound_message/);
  assert.match(richMigration, /pg_advisory_xact_lock/);
  assert.ok(
    richMigration.indexOf('public.is_contact_visible_to_user') < richMigration.indexOf('WHERE message.contact_id = p_contact_id'),
    'rich idempotency replay must authorize before probing a message key',
  );
  assert.match(richMigration, /outbound_delivery_payload/);
  assert.match(richMigration, /p_message_type NOT IN \('poll', 'contact'\)/);
  assert.match(richMigration, /p_message_type IS NULL/);
  assert.match(richMigration, /jsonb_typeof\(v_payload->'selectableCount'\) <> 'number'/);
  assert.match(richMigration, /regexp_replace\(v_payload->>'phoneNumber', '\\D', '', 'g'\)/);
  assert.match(richMigration, /REVOKE ALL ON FUNCTION public\.enqueue_rich_outbound_message[\s\S]*FROM PUBLIC, anon, service_role/);
  assert.match(richMigration, /GRANT EXECUTE ON FUNCTION public\.enqueue_rich_outbound_message[\s\S]*TO authenticated/);
});

test('base and rich enqueue serialize the same idempotency key and use a live connection', () => {
  const locationMigration = readFileSync(
    new URL('../../supabase/migrations/20260909250000_allow_location_in_atomic_outbound_delivery.sql', import.meta.url),
    'utf8',
  );
  for (const migrationText of [locationMigration, richMigration]) {
    assert.match(migrationText, /pg_advisory_xact_lock\(\s*hashtextextended\(p_contact_id::text \|\| ':' \|\| p_client_message_id::text, 0\)/);
    assert.match(migrationText, /connection\.status = 'connected'/);
    assert.match(migrationText, /selected_whatsapp_connection_unavailable/);
  }
  assert.match(locationMigration, /p_caption text DEFAULT NULL/);
  assert.match(locationMigration, /DROP FUNCTION public\.enqueue_outbound_message\(uuid, uuid, text, text, text, uuid, uuid\)/);
});

test('delivery claim normalizes formatted contact phones inside the lease transaction', () => {
  assert.match(phoneNormalizationMigration, /regexp_replace\(contact\.phone, '\\D', '', 'g'\)/);
  assert.match(phoneNormalizationMigration, /REVOKE ALL ON FUNCTION public\.claim_outbound_message/);
  assert.match(phoneNormalizationMigration, /TO service_role/);
});
