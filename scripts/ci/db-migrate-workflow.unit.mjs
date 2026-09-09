import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(
  new URL('../../.github/workflows/db-migrate.yml', import.meta.url),
  'utf8'
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
  assert.match(workflow, /comm -13 \/tmp\/local-versions \/tmp\/remote-versions/);
  assert.match(workflow, /REMOTE_ONLY_COUNT/);
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

test('message delivery phase 1 has strict absent/applied runtime contracts', () => {
  assert.match(
    workflow,
    /20260909220000\)\n[\s\S]*message-delivery-phase1-runtime\.sql/
  );
  assert.match(workflow, /TARGET_VERSION === '20260909220000'/);
  assert.match(workflow, /inputs\.migration_version == '20260909220000'/);
  assert.match(workflow, /proof\.message_column_count === 0/);
  assert.match(workflow, /proof\.message_column_count === 7/);
  assert.match(workflow, /proof\.column_contract_count === 9/);
  assert.match(workflow, /proof\.safe_api_function_count === 5/);
  assert.match(workflow, /proof\.internal_guard_function_count === 3/);
  assert.match(workflow, /proof\.internal_guard_trigger_count === 3/);
  assert.match(workflow, /proof\.trusted_owner_function_count === 8/);
  assert.match(workflow, /proof\.function_name_collision_count === 0/);
  assert.match(workflow, /proof\.trigger_name_collision_count === 0/);
  assert.match(workflow, /proof\.constraint_name_collision_count === 0/);
  assert.match(workflow, /proof\.authenticated_internal_guard_execute === false/);
  assert.match(workflow, /proof\.service_role_inherits_authenticated === true/);
  assert.match(workflow, /proof\.authenticated_enqueue_direct === true/);
  assert.match(workflow, /proof\.service_enqueue_effective === true/);
  assert.match(workflow, /proof\.service_enqueue_direct === false/);
  assert.match(workflow, /proof\.service_delivery_effective_count === 3/);
  assert.match(workflow, /proof\.service_delivery_direct_count === 3/);
  assert.match(
    workflow,
    /definition_sha256 === '60eb2a557b53775727d57bd7e74ee2497e69d105ab1a7dc1c20eef5cefff7883'/
  );
  assert.match(
    workflow,
    /constraint_definition_sha256 === '3a7b8480becb1fc422677195037169803648f8041c0f64515d3b9e885b2dad55'/
  );
  assert.match(
    workflow,
    /index_definition_sha256 === '1df306fd2981d1ee83aab373764a87cefdcfd474ac0e3b2023bedd9be046e976'/
  );
  assert.match(
    workflow,
    /trigger_definition_sha256 === '66ea750c2101611aac2a3eaf9de8e08ef01df4fe9fc1975791f35dafe1c83498'/
  );
});

test('Talk X template history migration has ACL, atomicity and runtime contracts', () => {
  assert.match(workflow, /20260909210000\)\n[\s\S]*talkx-template-history-runtime\.sql/);
  assert.match(workflow, /TARGET_VERSION === '20260909210000'/);
  assert.match(workflow, /inputs\.migration_version == '20260909210000'/);
  assert.match(workflow, /proof\.custom_variables_column_count === 1/);
  assert.match(workflow, /proof\.invalid_live_template_count === 0/);
  assert.match(workflow, /proof\.variant_table_count === 1/);
  assert.match(workflow, /proof\.invalid_variant_count === 0/);
  assert.match(workflow, /proof\.variant_canonical_policy_signature_count === 4/);
  assert.match(workflow, /proof\.variant_legacy_write_policy_count === 0/);
  assert.match(workflow, /proof\.variant_validated_constraint_count === 3/);
  assert.match(workflow, /proof\.recipient_variant_fk_count === 1/);
  assert.match(workflow, /proof\.variant_anon_any_access === false/);
  assert.match(workflow, /proof\.variant_authenticated_crud === true/);
  assert.match(workflow, /proof\.variant_authenticated_extra_access === false/);
  assert.match(workflow, /proof\.variant_service_role_crud === true/);
  assert.match(workflow, /proof\.variant_service_role_extra_access === false/);
  assert.match(workflow, /proof\.history_service_role_crud === true/);
  assert.match(workflow, /proof\.history_service_role_extra_access === false/);
  assert.match(workflow, /proof\.history_description_column_count === 1/);
  assert.match(workflow, /\[0, 1\]\.includes\(proof\.history_description_column_count\)/);
  assert.match(workflow, /\[1, 2\]\.includes\(proof\.policy_count\)/);
  assert.match(workflow, /\[3, 4\]\.includes\(proof\.foundation_constraint_count\)/);
  assert.match(workflow, /proof\.canonical_select_policy_count === 1/);
  assert.match(workflow, /proof\.validated_constraint_count === 3/);
  assert.match(workflow, /proof\.foundation_constraint_count === 4/);
  assert.match(workflow, /20260909230000\)/);
  assert.match(workflow, /TARGET_VERSION === '20260909230000'/);
  assert.match(workflow, /proof\.history_saved_by_fk_no_action_count === 1/);
  assert.match(workflow, /proof\.history_saved_by_fk_set_null_count === 1/);
  assert.match(workflow, /proof\.function_count === 6/);
  assert.match(workflow, /proof\.safe_function_count === 6/);
  assert.match(workflow, /proof\.immutable_trigger_count === 1/);
  assert.match(workflow, /proof\.template_update_guard_count === 1/);
  assert.match(workflow, /proof\.template_validation_trigger_count === 1/);
  assert.match(workflow, /proof\.template_timestamp_trigger_count === 1/);
  assert.match(workflow, /proof\.anon_any_access === false/);
  assert.match(workflow, /proof\.authenticated_any_mutation === false/);
  assert.match(workflow, /proof\.authenticated_rpc_execute === true/);
  assert.match(workflow, /proof\.authenticated_counter_execute === true/);
  assert.match(workflow, /proof\.authenticated_guard_execute === false/);
  assert.match(workflow, /proof\.authenticated_update_guard_execute === false/);
  assert.match(workflow, /proof\.authenticated_internal_function_execute_count === 0/);
  assert.match(
    workflow,
    /definition_sha256 === '079e2bd466e89e58251c7d14596453256cade54b9f0eddd4ce6df86ae751c2be'/
  );
});
