import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(
  new URL('../../.github/workflows/db-migrate.yml', import.meta.url),
  'utf8',
);

test('CRM rollout migration has preflight and post-deploy runtime contracts', () => {
  assert.match(workflow, /20260909120000\)\n[\s\S]*validated_constraint_count/);
  assert.match(workflow, /TARGET_VERSION === '20260909120000'/);
  assert.match(workflow, /inputs\.migration_version == '20260909120000'/);
  assert.match(workflow, /validated_constraints === 5/);
  assert.match(workflow, /safe_functions === 3/);
  assert.match(workflow, /proof\.auth_links_mutate === false/);
  assert.match(workflow, /proof\.anon_links_access === false/);
  assert.match(workflow, /proof\.runtime_flag_disabled === true/);
});

test('CRM rollout remains two-phase and identity-bound', () => {
  assert.match(workflow, /confirm_runtime_sha256/);
  assert.match(workflow, /proof\.runtime_sha256 !== process\.env\.CONFIRM_RUNTIME_SHA256/);
  assert.match(workflow, /confirm_project_ref/);
  assert.match(workflow, /OFFICIAL_PROJECT_REF: 'tnnnlkbymytvtqngbbqh'/);
  assert.match(workflow, /--dry-run --yes/);
});

test('public API kill switch has preflight and post-apply runtime contracts', () => {
  assert.match(workflow, /20260909180000\)\n[\s\S]*legacy_token_count/);
  assert.match(workflow, /TARGET_VERSION === '20260909180000'/);
  assert.match(workflow, /inputs\.migration_version == '20260909180000'/);
  assert.match(workflow, /proof\.legacy_token_count === 0/);
  assert.match(workflow, /proof\.constraint_count === 1/);
  assert.match(workflow, /global_settings_no_plaintext_api_token/);
});

test('Inbox authorization migration has caller-bound and post-apply contracts', () => {
  assert.match(workflow, /20260909200000\)\n[\s\S]*caller_bound_count/);
  assert.match(workflow, /TARGET_VERSION === '20260909200000'/);
  assert.match(workflow, /inputs\.migration_version == '20260909200000'/);
  assert.match(workflow, /proof\.caller_bound_count === 3/);
  assert.match(workflow, /proof\.note_rls_enabled === true/);
  assert.match(workflow, /proof\.rpc_authorized_count === 1/);
  assert.match(workflow, /proof\.policy_signature_count === 4/);
  assert.match(workflow, /proof\.anon_api_execute_count === 0/);
  assert.match(workflow, /proof\.guard_authenticated_execute === false/);
  assert.match(workflow, /proof\.guard_anon_execute === false/);
  assert.match(workflow, /inbox-contact-authorization-runtime\.sql/);
  assert.match(workflow, /proof\.anon_note_access === false/);
  assert.match(workflow, /proof\.authenticated_note_crud === true/);
  assert.match(workflow, /proof\.service_note_extra === false/);
  assert.match(workflow, /definition_sha256 === '[a-f0-9]{64}'/);
});

test('Talk X template history migration has ACL, atomicity and runtime contracts', () => {
  assert.match(workflow, /20260909210000\)\n[\s\S]*talkx-template-history-runtime\.sql/);
  assert.match(workflow, /TARGET_VERSION === '20260909210000'/);
  assert.match(workflow, /inputs\.migration_version == '20260909210000'/);
  assert.match(workflow, /proof\.custom_variables_column_count === 1/);
  assert.match(workflow, /proof\.history_description_column_count === 1/);
  assert.match(workflow, /\[0, 1\]\.includes\(proof\.history_description_column_count\)/);
  assert.match(workflow, /\[1, 2\]\.includes\(proof\.policy_count\)/);
  assert.match(workflow, /\[3, 4\]\.includes\(proof\.foundation_constraint_count\)/);
  assert.match(workflow, /proof\.canonical_select_policy_count === 1/);
  assert.match(workflow, /proof\.validated_constraint_count === 3/);
  assert.match(workflow, /proof\.foundation_constraint_count === 4/);
  assert.match(workflow, /proof\.safe_function_count === 4/);
  assert.match(workflow, /proof\.immutable_trigger_count === 1/);
  assert.match(workflow, /proof\.template_update_guard_count === 1/);
  assert.match(workflow, /proof\.anon_any_access === false/);
  assert.match(workflow, /proof\.authenticated_any_mutation === false/);
  assert.match(workflow, /proof\.authenticated_rpc_execute === true/);
  assert.match(workflow, /proof\.authenticated_counter_execute === true/);
  assert.match(workflow, /proof\.authenticated_guard_execute === false/);
  assert.match(workflow, /proof\.authenticated_update_guard_execute === false/);
  assert.match(workflow, /definition_sha256 === 'fe8ee233b88420087f7fe0ddfa5edb4784a57af2df1188040f2acba9f77cc337'/);
});
