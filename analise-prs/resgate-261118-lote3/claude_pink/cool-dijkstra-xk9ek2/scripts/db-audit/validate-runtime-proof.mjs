// Extraído de db-migrate.yml (GA16): valida o JSON de runtime emitido por
// run-runtime-contract.mjs antes de aplicar uma migration. Lê do env:
//   RUNTIME_JSON            — saída de run-runtime-contract.mjs
//   TARGET_VERSION          — versão alvo (14 dígitos)
//   NEEDS_APPLY             — 'true' se a migration ainda não está no banco
//   APPLY_BUNDLE            — 'true' para bundle atomico
//   APPLY                   — 'true' para apply real (não dry-run)
//   CONFIRM_RUNTIME_SHA256  — hash do dry-run anterior (para apply)
//   GITHUB_SHA              — commit atual
const proof = JSON.parse(process.env.RUNTIME_JSON);
const common = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '');
let targetOk = false;
if (process.env.TARGET_VERSION === '20260830170000') {
  targetOk = proof.function_count === 1
    && proof.security_definer === true
    && proof.stable === true
    && proof.search_path_fixed === true
    && proof.filters_active === true;
} else if (process.env.TARGET_VERSION === '20260831120000') {
  const base = proof.table_count === 1
    && proof.rls_enabled === true
    && proof.policy_count === 1
    && proof.service_role_crud === true;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? base
      && proof.public_policy_count === 1
      && proof.service_role_policy_count === 0
      && proof.anon_acl === true
      && proof.authenticated_acl === true
    : base
      && proof.public_policy_count === 0
      && proof.service_role_policy_count === 1
      && proof.anon_acl === false
      && proof.authenticated_acl === false
      && proof.service_role_extra === false;
} else if (process.env.TARGET_VERSION === '20260831150000') {
  targetOk = proof.source_count === 4
    && Number.isInteger(proof.legacy_signed_url_count)
    && proof.legacy_signed_url_count >= 0
    && (process.env.NEEDS_APPLY === 'true' || proof.legacy_signed_url_count === 0);
} else if (process.env.TARGET_VERSION === '20260908180000') {
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? proof.table_count === 0
      && proof.rls_count === 0
      && proof.function_count === 0
      && proof.safe_function_count === 0
      && proof.trigger_count === 0
    : proof.table_count === 2
      && proof.rls_count === 2
      && proof.function_count === 6
      && proof.safe_function_count === 6
      && proof.trigger_count === 1;
} else if (process.env.TARGET_VERSION === '20260908220000') {
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? proof.lease_column_count === 0
      && proof.new_complete_count === 0
      && proof.old_complete_count === 1
      && proof.new_fail_count === 0
      && proof.state_constraint_count === 0
    : proof.lease_column_count === 1
      && proof.new_complete_count === 1
      && proof.old_complete_count === 0
      && proof.new_fail_count === 1
      && proof.state_constraint_count === 3;
} else if (process.env.TARGET_VERSION === '20260909120000') {
  const base = proof.table_count === 2
    && proof.constraint_count === 5
    && proof.flag_enabled === false;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? base
      && proof.function_count === 0
      && proof.flag_count === 0
    : base
      && proof.validated_constraint_count === 5
      && proof.function_count === 3
      && proof.safe_function_count === 3
      && proof.flag_count === 1;
} else if (process.env.TARGET_VERSION === '20260909180000') {
  const base = proof.relation_count === 1
    && Number.isInteger(proof.legacy_token_count)
    && proof.legacy_token_count >= 0
    && proof.legacy_token_count <= 1;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? base
      && proof.constraint_count === 0
      && proof.validated_constraint_count === 0
    : base
      && proof.legacy_token_count === 0
      && proof.constraint_count === 1
      && proof.validated_constraint_count === 1;
} else if (process.env.TARGET_VERSION === '20260909200000') {
  const base = proof.note_table_count === 1
    && proof.function_count === 4
    && proof.note_rls_enabled === true
    && Number.isInteger(proof.policy_count)
    && proof.policy_count >= 0;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? base
    : base
      && proof.safe_function_count === 4
      && proof.definition_sha256 === '55078d2e365413bea0b93777ec63e70063def445760d0ae8f516670b86070771'
      && proof.caller_bound_count === 3
      && proof.rpc_authorized_count === 1
      && proof.policy_count === 4
      && proof.policy_signature_count === 4
      && proof.identity_trigger_count === 1
      && proof.authenticated_api_execute_count === 4
      && proof.anon_api_execute_count === 0
      && proof.guard_authenticated_execute === false
      && proof.guard_anon_execute === false
      && proof.anon_note_access === false
      && proof.authenticated_note_crud === true
      && proof.authenticated_note_extra === false
      && proof.service_note_crud === true
      && proof.service_note_extra === false;
} else if (process.env.TARGET_VERSION === '20260909210000') {
  const base = proof.table_count === 1
    && proof.variant_table_count === 1
    && proof.custom_variables_column_count === 1
    && proof.invalid_live_template_count === 0
    && proof.invalid_variant_count === 0
    && proof.variant_rls_enabled === true
    && proof.recipient_variant_fk_count === 1
    && proof.rls_enabled === true;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? base
      && (
        (proof.variant_policy_count === 2
         && proof.variant_legacy_write_policy_count === 1
         && proof.variant_canonical_policy_signature_count === 0
         && proof.variant_validated_constraint_count === 0)
        ||
        (proof.variant_policy_count === 4
         && proof.variant_legacy_write_policy_count === 0
         && proof.variant_canonical_policy_signature_count === 4
         && proof.variant_validated_constraint_count === 3
         && proof.variant_anon_any_access === false
         && proof.variant_authenticated_crud === true
         && proof.variant_authenticated_extra_access === false
         && proof.variant_service_role_crud === true
         && proof.variant_service_role_extra_access === false)
      )
      && [0, 1].includes(proof.history_description_column_count)
      && [1, 2].includes(proof.policy_count)
      && [3, 4].includes(proof.foundation_constraint_count)
      && proof.function_count === 0
      && proof.safe_function_count === 0
      && proof.constraint_count === 0
      && proof.immutable_trigger_count === 0
      && proof.template_update_guard_count === 0
      && proof.template_validation_trigger_count === 0
      && proof.template_timestamp_trigger_count === 0
      && proof.anon_any_access === true
      && proof.authenticated_select === true
      && proof.authenticated_any_mutation === true
      && proof.authenticated_rpc_execute === false
      && proof.authenticated_internal_function_execute_count === 0
    : base
      && proof.variant_policy_count === 4
      && proof.variant_legacy_write_policy_count === 0
      && proof.variant_canonical_policy_signature_count === 4
      && proof.variant_validated_constraint_count === 3
      && proof.variant_anon_any_access === false
      && proof.variant_authenticated_crud === true
      && proof.variant_authenticated_extra_access === false
      && proof.variant_service_role_crud === true
      && proof.variant_service_role_extra_access === false
      && proof.history_description_column_count === 1
      && proof.policy_count === 1
      && proof.foundation_constraint_count === 4
      && proof.canonical_select_policy_count === 1
      && proof.constraint_count === 3
      && proof.validated_constraint_count === 3
      && proof.function_count === 6
      && proof.safe_function_count === 6
      && proof.definition_sha256 === '079e2bd466e89e58251c7d14596453256cade54b9f0eddd4ce6df86ae751c2be'
      && proof.immutable_trigger_count === 1
      && proof.template_update_guard_count === 1
      && proof.template_validation_trigger_count === 1
      && proof.template_timestamp_trigger_count === 1
      && proof.anon_any_access === false
      && proof.authenticated_select === true
      && proof.authenticated_any_mutation === false
      && proof.history_service_role_crud === true
      && proof.history_service_role_extra_access === false
      && proof.authenticated_rpc_execute === true
      && proof.anon_rpc_execute === false
      && proof.authenticated_counter_execute === true
      && proof.anon_counter_execute === false
      && proof.authenticated_guard_execute === false
      && proof.authenticated_update_guard_execute === false
      && proof.authenticated_internal_function_execute_count === 0;
} else if (process.env.TARGET_VERSION === '20260909220000') {
  const absent = proof.message_column_count === 0
    && proof.closure_column_count === 0
    && proof.event_column_count === 0
    && proof.column_contract_count === 0
    && proof.validated_constraint_count === 0
    && proof.index_count === 0
    && proof.function_count === 0
    && proof.safe_api_function_count === 0
    && proof.internal_guard_function_count === 0
    && proof.internal_guard_trigger_count === 0
    && proof.trusted_owner_function_count === 0
    && proof.function_name_collision_count === 0
    && proof.trigger_name_collision_count === 0
    && proof.constraint_name_collision_count === 0
    && proof.service_role_inherits_authenticated === false
    && proof.authenticated_enqueue_effective === false
    && proof.authenticated_enqueue_direct === false
    && proof.authenticated_close_effective === false
    && proof.authenticated_close_direct === false
    && proof.service_enqueue_effective === false
    && proof.service_enqueue_direct === false
    && proof.service_close_effective === false
    && proof.service_close_direct === false
    && proof.authenticated_privileged_delivery === false
    && proof.authenticated_internal_guard_execute === false
    && proof.service_internal_guard_execute === false
    && proof.service_internal_guard_direct_count === 0
    && proof.anon_any_execute === false
    && proof.service_delivery_effective_count === 0
    && proof.service_delivery_direct_count === 0
    && proof.custom_guc_reference_count === 0;
  const applied = proof.message_column_count === 7
    && proof.closure_column_count === 1
    && proof.event_column_count === 1
    && proof.column_contract_count === 9
    && proof.validated_constraint_count === 4
    && proof.index_count === 4
    && proof.function_count === 8
    && proof.safe_api_function_count === 5
    && proof.internal_guard_function_count === 3
    && proof.internal_guard_trigger_count === 3
    && proof.trusted_owner_function_count === 8
    && proof.function_name_collision_count === 0
    && proof.trigger_name_collision_count === 0
    && proof.constraint_name_collision_count === 0
    && proof.definition_sha256 === '60eb2a557b53775727d57bd7e74ee2497e69d105ab1a7dc1c20eef5cefff7883'
    && proof.constraint_definition_sha256 === '3a7b8480becb1fc422677195037169803648f8041c0f64515d3b9e885b2dad55'
    && proof.index_definition_sha256 === '1df306fd2981d1ee83aab373764a87cefdcfd474ac0e3b2023bedd9be046e976'
    && proof.trigger_definition_sha256 === '66ea750c2101611aac2a3eaf9de8e08ef01df4fe9fc1975791f35dafe1c83498'
    && proof.service_role_inherits_authenticated === false
    && proof.authenticated_enqueue_effective === true
    && proof.authenticated_enqueue_direct === true
    && proof.authenticated_close_effective === true
    && proof.authenticated_close_direct === true
    && proof.service_enqueue_effective === false
    && proof.service_enqueue_direct === false
    && proof.service_close_effective === true
    && proof.service_close_direct === true
    && proof.authenticated_privileged_delivery === false
    && proof.authenticated_internal_guard_execute === false
    && proof.service_internal_guard_execute === false
    && proof.service_internal_guard_direct_count === 0
    && proof.anon_any_execute === false
    && proof.service_delivery_effective_count === 3
    && proof.service_delivery_direct_count === 3
    && proof.custom_guc_reference_count === 0;
  targetOk = process.env.NEEDS_APPLY === 'true' ? absent : applied;
} else if (process.env.TARGET_VERSION === '20260909240000') {
  const commonMessageRuntime = proof.message_column_count === 7
    && proof.closure_column_count === 1
    && proof.event_column_count === 1
    && proof.column_contract_count === 9
    && proof.validated_constraint_count === 4
    && proof.index_count === 4
    && proof.function_count === 8
    && proof.safe_api_function_count === 5
    && proof.internal_guard_function_count === 3
    && proof.internal_guard_trigger_count === 3
    && proof.trusted_owner_function_count === 8
    && proof.function_name_collision_count === 0
    && proof.trigger_name_collision_count === 0
    && proof.constraint_name_collision_count === 0
    && proof.definition_sha256 === '60eb2a557b53775727d57bd7e74ee2497e69d105ab1a7dc1c20eef5cefff7883'
    && proof.constraint_definition_sha256 === '3a7b8480becb1fc422677195037169803648f8041c0f64515d3b9e885b2dad55'
    && proof.index_definition_sha256 === '1df306fd2981d1ee83aab373764a87cefdcfd474ac0e3b2023bedd9be046e976'
    && proof.trigger_definition_sha256 === '66ea750c2101611aac2a3eaf9de8e08ef01df4fe9fc1975791f35dafe1c83498'
    && proof.service_role_inherits_authenticated === false
    && proof.authenticated_enqueue_effective === true
    && proof.authenticated_enqueue_direct === true
    && proof.authenticated_close_effective === true
    && proof.authenticated_close_direct === true
    && proof.service_close_effective === true
    && proof.service_close_direct === true
    && proof.authenticated_privileged_delivery === false
    && proof.authenticated_internal_guard_execute === false
    && proof.anon_any_execute === false
    && proof.service_delivery_effective_count === 3
    && proof.service_delivery_direct_count === 3
    && proof.custom_guc_reference_count === 0;
  const preHardening = commonMessageRuntime
    && proof.service_enqueue_effective === true
    && proof.service_enqueue_direct === true
    && proof.service_internal_guard_execute === true
    && proof.service_internal_guard_direct_count === 3;
  const hardened = commonMessageRuntime
    && proof.service_enqueue_effective === false
    && proof.service_enqueue_direct === false
    && proof.service_internal_guard_execute === false
    && proof.service_internal_guard_direct_count === 0;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? preHardening
    : hardened;
} else if (process.env.TARGET_VERSION === '20260909250000') {
  // Location support only extends the enqueue contract; the
  // structural delivery primitives and hardened grants remain.
  const base = proof.message_column_count === 7
    && proof.closure_column_count === 1
    && proof.event_column_count === 1
    && proof.column_contract_count === 9
    && proof.validated_constraint_count === 4
    && proof.index_count === 4
    && proof.function_count === 8
    && proof.safe_api_function_count === 5
    && proof.internal_guard_function_count === 3
    && proof.internal_guard_trigger_count === 3
    && proof.trusted_owner_function_count === 8
    && proof.function_name_collision_count === 0
    && proof.trigger_name_collision_count === 0
    && proof.constraint_name_collision_count === 0
    && proof.authenticated_enqueue_effective === true
    && proof.authenticated_enqueue_direct === true
    && proof.service_enqueue_effective === false
    && proof.service_enqueue_direct === false
    && proof.authenticated_rich_enqueue_effective === false
    && proof.authenticated_rich_enqueue_direct === false
    && proof.service_rich_enqueue_effective === false
    && proof.service_rich_enqueue_direct === false
    && proof.authenticated_privileged_delivery === false
    && proof.anon_any_execute === false
    && proof.service_delivery_effective_count === 3
    && proof.service_delivery_direct_count === 3
    && proof.custom_guc_reference_count === 0;
  targetOk = base && proof.definition_sha256 === (
    process.env.NEEDS_APPLY === 'true'
      ? '60eb2a557b53775727d57bd7e74ee2497e69d105ab1a7dc1c20eef5cefff7883'
      : '7bfca6ba72e24deb3bb7d502b02583dddcf64e79760e316722e560a7f4375030'
  );
} else if (process.env.TARGET_VERSION === '20260909260000') {
  const preRich = proof.function_count === 8
    && proof.safe_api_function_count === 5
    && proof.trusted_owner_function_count === 8
    && proof.authenticated_rich_enqueue_effective === false
    && proof.authenticated_rich_enqueue_direct === false
    && proof.service_rich_enqueue_effective === false
    && proof.service_rich_enqueue_direct === false
    && proof.service_enqueue_effective === false
    && proof.service_enqueue_direct === false
    && proof.anon_any_execute === false;
  const richApplied = proof.message_column_count === 7
    && proof.closure_column_count === 1
    && proof.event_column_count === 1
    && proof.column_contract_count === 9
    && proof.validated_constraint_count === 4
    && proof.index_count === 4
    && proof.function_count === 9
    && proof.safe_api_function_count === 6
    && proof.internal_guard_function_count === 3
    && proof.internal_guard_trigger_count === 3
    && proof.trusted_owner_function_count === 9
    && proof.function_name_collision_count === 0
    && proof.trigger_name_collision_count === 0
    && proof.constraint_name_collision_count === 0
    && proof.definition_sha256 === '3911c42177edfdba13af479b404a05fc8e9453f5f81538a1892db6e195b31472'
    && proof.constraint_definition_sha256 === '3a7b8480becb1fc422677195037169803648f8041c0f64515d3b9e885b2dad55'
    && proof.index_definition_sha256 === '1df306fd2981d1ee83aab373764a87cefdcfd474ac0e3b2023bedd9be046e976'
    && proof.trigger_definition_sha256 === '66ea750c2101611aac2a3eaf9de8e08ef01df4fe9fc1975791f35dafe1c83498'
    && proof.authenticated_enqueue_effective === true
    && proof.authenticated_enqueue_direct === true
    && proof.authenticated_rich_enqueue_effective === true
    && proof.authenticated_rich_enqueue_direct === true
    && proof.service_enqueue_effective === false
    && proof.service_enqueue_direct === false
    && proof.service_rich_enqueue_effective === false
    && proof.service_rich_enqueue_direct === false
    && proof.authenticated_privileged_delivery === false
    && proof.authenticated_internal_guard_execute === false
    && proof.service_internal_guard_execute === false
    && proof.service_internal_guard_direct_count === 0
    && proof.anon_any_execute === false
    && proof.service_delivery_effective_count === 3
    && proof.service_delivery_direct_count === 3
    && proof.custom_guc_reference_count === 0;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? preRich && proof.definition_sha256 === '7bfca6ba72e24deb3bb7d502b02583dddcf64e79760e316722e560a7f4375030'
    : richApplied;
} else if (process.env.TARGET_VERSION === '20260909270000') {
  const base = proof.message_column_count === 7
    && proof.closure_column_count === 1
    && proof.event_column_count === 1
    && proof.column_contract_count === 9
    && proof.validated_constraint_count === 4
    && proof.index_count === 4
    && proof.function_count === 9
    && proof.safe_api_function_count === 6
    && proof.internal_guard_function_count === 3
    && proof.internal_guard_trigger_count === 3
    && proof.trusted_owner_function_count === 9
    && proof.function_name_collision_count === 0
    && proof.trigger_name_collision_count === 0
    && proof.constraint_name_collision_count === 0
    && proof.authenticated_enqueue_effective === true
    && proof.authenticated_enqueue_direct === true
    && proof.authenticated_rich_enqueue_effective === true
    && proof.authenticated_rich_enqueue_direct === true
    && proof.service_enqueue_effective === false
    && proof.service_enqueue_direct === false
    && proof.service_rich_enqueue_effective === false
    && proof.service_rich_enqueue_direct === false
    && proof.authenticated_privileged_delivery === false
    && proof.authenticated_internal_guard_execute === false
    && proof.service_internal_guard_execute === false
    && proof.service_internal_guard_direct_count === 0
    && proof.anon_any_execute === false
    && proof.service_delivery_effective_count === 3
    && proof.service_delivery_direct_count === 3
    && proof.custom_guc_reference_count === 0;
  targetOk = base && (
    process.env.NEEDS_APPLY === 'true'
      ? (
        process.env.APPLY_BUNDLE === 'true'
          ? proof.definition_sha256 === '60eb2a557b53775727d57bd7e74ee2497e69d105ab1a7dc1c20eef5cefff7883'
          : proof.definition_sha256 === '3911c42177edfdba13af479b404a05fc8e9453f5f81538a1892db6e195b31472'
      )
      : proof.definition_sha256 === '46d8cea7dd5ece11089f79f8bd06552d0b6004e912aeaf4b28e3c4cdb43811ab'
  );
} else if (process.env.TARGET_VERSION === '20260909230000') {
  const canonicalExceptSavedByAction = proof.table_count === 1
    && proof.variant_table_count === 1
    && proof.custom_variables_column_count === 1
    && proof.invalid_live_template_count === 0
    && proof.invalid_variant_count === 0
    && proof.variant_rls_enabled === true
    && proof.variant_policy_count === 4
    && proof.variant_legacy_write_policy_count === 0
    && proof.variant_canonical_policy_signature_count === 4
    && proof.variant_validated_constraint_count === 3
    && proof.recipient_variant_fk_count === 1
    && proof.variant_anon_any_access === false
    && proof.variant_authenticated_crud === true
    && proof.variant_authenticated_extra_access === false
    && proof.variant_service_role_crud === true
    && proof.variant_service_role_extra_access === false
    && proof.history_description_column_count === 1
    && proof.rls_enabled === true
    && proof.policy_count === 1
    && proof.canonical_select_policy_count === 1
    && proof.constraint_count === 3
    && proof.validated_constraint_count === 3
    && proof.function_count === 6
    && proof.safe_function_count === 6
    && proof.definition_sha256 === '079e2bd466e89e58251c7d14596453256cade54b9f0eddd4ce6df86ae751c2be'
    && proof.immutable_trigger_count === 1
    && proof.template_update_guard_count === 1
    && proof.template_validation_trigger_count === 1
    && proof.template_timestamp_trigger_count === 1
    && proof.anon_any_access === false
    && proof.authenticated_select === true
    && proof.authenticated_any_mutation === false
    && proof.history_service_role_crud === true
    && proof.history_service_role_extra_access === false
    && proof.authenticated_rpc_execute === true
    && proof.anon_rpc_execute === false
    && proof.authenticated_counter_execute === true
    && proof.anon_counter_execute === false
    && proof.authenticated_guard_execute === false
    && proof.authenticated_update_guard_execute === false
    && proof.authenticated_internal_function_execute_count === 0;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? canonicalExceptSavedByAction
      && proof.foundation_constraint_count === 3
      && proof.history_saved_by_fk_no_action_count === 1
      && proof.history_saved_by_fk_set_null_count === 0
    : canonicalExceptSavedByAction
      && proof.foundation_constraint_count === 4
      && proof.history_saved_by_fk_no_action_count === 0
      && proof.history_saved_by_fk_set_null_count === 1;
} else if (process.env.TARGET_VERSION === '20260910100000') {
  const base = proof.relation_count === 1
    && proof.rls_enabled === true
    && proof.policy_count === 1
    && proof.update_policy_count === 1
    && proof.authenticated_policy_count === 1;
  targetOk = process.env.NEEDS_APPLY === 'true'
    ? base && proof.legacy_permissive_count === 1 && proof.restricted_policy_count === 0
    : base && proof.legacy_permissive_count === 0 && proof.restricted_policy_count === 1;
} else if (process.env.TARGET_VERSION === '20260912130000') {
  const commonTalkX = proof.table_count === 2
    && proof.rls_table_count === 2;
  const beforeRollout = proof.recipient_rollout_column_count === 0
    && proof.campaign_rollout_column_count === 0
    && proof.function_count === 0
    && proof.security_definer_match_count === 0
    && proof.safe_path_count === 0
    && proof.anonymous_execute_count === 0
    && proof.authenticated_execute_match_count === 0
    && proof.service_execute_match_count === 0
    && proof.trigger_count === 0
    && proof.enabled_trigger_count === 0
    && proof.constraint_count === 1
    && proof.validated_constraint_count === 1
    && proof.index_count === 1
    && proof.valid_ready_index_count === 1
    && proof.function_definition_sha256 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    && proof.trigger_definition_sha256 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    && /^[a-f0-9]{64}$/.test(proof.constraint_definition_sha256 || '')
    && /^[a-f0-9]{64}$/.test(proof.index_definition_sha256 || '');
  const afterRollout = proof.recipient_rollout_column_count === 11
    && proof.campaign_rollout_column_count === 4
    && proof.function_count === 15
    && proof.security_definer_match_count === 15
    && proof.safe_path_count === 15
    && proof.anonymous_execute_count === 0
    && proof.authenticated_execute_match_count === 15
    && proof.service_execute_match_count === 15
    && proof.trigger_count === 2
    && proof.enabled_trigger_count === 2
    && proof.constraint_count === 7
    && proof.validated_constraint_count === 7
    && proof.index_count === 3
    && proof.valid_ready_index_count === 3
    && ['function', 'trigger', 'constraint', 'index'].every((kind) =>
      /^[a-f0-9]{64}$/.test(proof[`${kind}_definition_sha256`] || '')
    );
  targetOk = commonTalkX && (
    process.env.NEEDS_APPLY === 'true' ? beforeRollout : afterRollout
  );
} else if (process.env.TARGET_VERSION === '20260912140000') {
  const commonTalkX = proof.table_count === 2
    && proof.rls_table_count === 2
    && proof.recipient_rollout_column_count === 11
    && proof.campaign_rollout_column_count === 4
    && proof.function_count === 15
    && proof.security_definer_match_count === 15
    && proof.safe_path_count === 15
    && proof.trigger_count === 2
    && proof.enabled_trigger_count === 2
    && proof.constraint_count === 7
    && proof.index_count === 3
    && proof.valid_ready_index_count === 3
    && ['function', 'trigger', 'constraint', 'index'].every((kind) =>
      /^[a-f0-9]{64}$/.test(proof[`${kind}_definition_sha256`] || '')
    );
  const beforeHardening = proof.anonymous_execute_count === 3
    && proof.authenticated_execute_match_count === 13
    && proof.service_execute_match_count === 11
    && proof.validated_constraint_count === 2;
  const afterHardening = proof.anonymous_execute_count === 0
    && proof.authenticated_execute_match_count === 15
    && proof.service_execute_match_count === 15
    && proof.validated_constraint_count === 7;
  targetOk = commonTalkX && (
    process.env.NEEDS_APPLY === 'true' ? beforeHardening : afterHardening
  );
} else if (process.env.TARGET_VERSION === '20260922220000') {
  const commonNotifications = proof.base_table_count === 3
    && proof.calls_table_count === 1
    && proof.function_name_count === proof.function_signature_count
    && /^[a-f0-9]{64}$/.test(proof.function_definition_sha256 || '');
  const beforeAtomicity = proof.provider_event_column_count === 0
    && proof.constraint_count === 0
    && proof.validated_constraint_count === 0
    && proof.index_count === 0
    && proof.valid_unique_partial_index_count === 0
    && proof.function_signature_count === 0
    && proof.security_definer_count === 0
    && proof.safe_path_count === 0
    && proof.trusted_owner_count === 0
    && proof.public_execute_count === 0
    && proof.anon_execute_count === 0
    && proof.authenticated_execute_count === 0
    && proof.service_execute_count === 0;
  const afterAtomicity = proof.provider_event_column_count === 1
    && proof.constraint_count === 1
    && proof.validated_constraint_count === 1
    && proof.index_count === 1
    && proof.valid_unique_partial_index_count === 1
    && proof.function_signature_count === 2
    && proof.security_definer_count === 2
    && proof.safe_path_count === 2
    && proof.trusted_owner_count === 2
    && proof.public_execute_count === 0
    && proof.anon_execute_count === 0
    && proof.authenticated_execute_count === 0
    && proof.service_execute_count === 2;
  targetOk = commonNotifications && (
    process.env.NEEDS_APPLY === 'true' ? beforeAtomicity : afterAtomicity
  );
} else if (proof.contract === 'generic') {
  // Sem assercoes semanticas de proposito: o contrato generico prova
  // integridade estrutural, e a autorizacao do apply continua vindo da
  // comparacao do runtime_sha256 com o hash do dry-run, logo abaixo.
  // Estes testes apenas rejeitam um payload truncado ou vazio.
  targetOk = Number.isInteger(proof.table_count) && proof.table_count > 0
    && Number.isInteger(proof.function_count) && proof.function_count >= 0
    && Number.isInteger(proof.policy_count) && proof.policy_count >= 0
    && Number.isInteger(proof.ledger_count) && proof.ledger_count > 0
    && /^[a-f0-9]{64}$/.test(proof.structure_sha256 || '');
  console.error('Contrato generico: estrutura de public em '
    + String(proof.structure_sha256).slice(0, 12)
    + '; a autorizacao do apply depende da confirmacao do runtime_sha256 do dry-run.');
}
const ok = common && targetOk;
if (!ok) {
  console.error('Estado runtime inesperado; migration cancelada.');
  process.exit(1);
}
// E64 / defeito F-11 ("confirm_runtime_sha256 nao amarra o arquivo",
// PLANO_..._2026-09-27.md:196): a confirmacao cobria so' o estado do
// schema, entao editar o .sql entre o dry-run e o apply passava -- o
// banco nao muda por causa de uma edicao de arquivo. Agora o
// confirm_runtime_sha256 e' o SHA-256 de runtime + arquivo + commit.
const { readdirSync, appendFileSync } = await import('node:fs');
const { pathToFileURL } = await import('node:url');
const modHash = await import(pathToFileURL(`${process.cwd()}/scripts/db-audit/confirm-hash.mjs`).href);
const candidatos = readdirSync('supabase/migrations')
  .filter((f) => f.startsWith(`${process.env.TARGET_VERSION}_`) && f.endsWith('.sql'));
if (candidatos.length !== 1) {
  console.error(`Alvo ${process.env.TARGET_VERSION} mapeia para ${candidatos.length} arquivos; migration cancelada.`);
  process.exit(1);
}
const arquivoAlvo = `supabase/migrations/${candidatos[0]}`;
const arquivoSha256 = modHash.sha256DeArquivo(arquivoAlvo);
const confirmacao = modHash.comporHashConfirmacao({
  runtimeSha256: proof.runtime_sha256,
  arquivoSha256,
  commitSha: process.env.GITHUB_SHA,
});
console.error(modHash.descreverConfirmacao({
  runtimeSha256: proof.runtime_sha256,
  arquivoSha256,
  commitSha: process.env.GITHUB_SHA,
  arquivo: arquivoAlvo,
}));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `confirm_runtime_sha256=${confirmacao}\n`);
}
// GA04: hash também vai para stdout para captura em testes e pipelines locais.
// Qualquer mensagem diagnóstica fica em stderr; stdout é exclusivamente o hash.
process.stdout.write(confirmacao + '\n');
if (process.env.APPLY === 'true' && confirmacao !== process.env.CONFIRM_RUNTIME_SHA256) {
  console.error('Confirmacao recusada: runtime, arquivo ou commit mudaram desde o dry-run; migration cancelada.');
  process.exit(1);
}
