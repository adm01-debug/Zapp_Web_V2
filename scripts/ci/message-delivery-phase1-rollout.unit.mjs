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

test('message delivery phase 1 remains additive and deployment-order safe', () => {
  assert.doesNotMatch(executableMigration, /DROP\s+POLICY/i);
  assert.doesNotMatch(withoutFunctionAcl, /REVOKE[\s\S]*?ON\s+(?:TABLE\s+)?public\./i);
  assert.doesNotMatch(executableMigration, /(?:current_setting|set_config)\s*\(\s*['"]app\./i);
  assert.match(migration, /SET LOCAL lock_timeout = '5s'/);
  assert.match(migration, /SET LOCAL statement_timeout = '120s'/);
  assert.match(migration, /ADD COLUMN delivery_last_claim_token uuid/);
  assert.match(migration, /CREATE TRIGGER trg_guard_message_delivery_internal_fields/);
  assert.match(migration, /CREATE TRIGGER trg_guard_conversation_closure_request_id/);
  assert.match(migration, /CREATE TRIGGER trg_guard_conversation_event_closure_id/);
  assert.match(migration, /current_user IN \('postgres', 'service_role'\)/);
  assert.match(migration, /delivery_last_claim_token = p_claim_token/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enqueue_outbound_message/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.claim_outbound_message/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.close_conversation_atomic/);
});

test('offline DB guard executes the PostgreSQL 17 behavioral harness', () => {
  assert.match(dbGuard, /message-delivery-phase1-behavior\.test\.sh/);
  assert.match(dbGuard, /MESSAGE_DELIVERY_TEST_POSTGRES_IMAGE:\s*postgres:17-alpine/);
});
