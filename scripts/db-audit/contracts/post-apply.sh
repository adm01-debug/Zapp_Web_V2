#!/usr/bin/env bash
# GA16 (plano 2026-10-15): as 16 validacoes pos-apply de versions historicas,
# extraidas VERBATIM do `.github/workflows/db-migrate.yml` (etapas "Validar ...").
# Mesma semantica: cada funcao abaixo e o corpo `run:` original da etapa.
# O workflow chama este dispatcher com TARGET_VERSION (+ NEEDS_APPLY/APPLY);
# o `case` replica os guardas `inputs.migration_version == ...` do YAML.
# Chamador garante: `[ "$NEEDS_APPLY" = "false" ] || [ "$APPLY" = "true" ]`.
# Shell: mesmo do workflow (bash --noprofile --norc -euo pipefail).
set -euo pipefail
# Origem YAML: etapa "Validar ledger completo do bundle de entrega atomica"
validar_ledger_entrega_atomica() {
BUNDLE_COUNT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  SELECT count(*)
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20260909250000', '20260909260000', '20260909270000');
SQL
)
test "$BUNDLE_COUNT" = "3"
echo "OK: ledger possui todas as tres migrations do contrato atomico."
}

# Origem YAML: etapa "Validar ledger completo do bundle de recuperacao Talk X"
validar_ledger_recuperacao_talkx() {
BUNDLE_COUNT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  SELECT count(*)
  FROM supabase_migrations.schema_migrations
  WHERE version IN (
    '20260911130000', '20260911140000', '20260911150000',
    '20260911160000', '20260911170000', '20260911180000',
    '20260911190000', '20260911200000', '20260912110000',
    '20260912120000', '20260912130000'
  );
SQL
)
test "$BUNDLE_COUNT" = "11"
echo "OK: ledger possui as 11 migrations ordenadas da recuperacao Talk X."
}

# Origem YAML: etapa "Validar runtime atomico de chamadas e sentimento"
validar_runtime_chamadas_sentimento() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
  -f scripts/db-audit/notification-delivery-atomicity-runtime.sql)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && proof.base_table_count === 3
  && proof.calls_table_count === 1
  && proof.provider_event_column_count === 1
  && proof.constraint_count === 1
  && proof.validated_constraint_count === 1
  && proof.index_count === 1
  && proof.valid_unique_partial_index_count === 1
  && proof.function_name_count === 2
  && proof.function_signature_count === 2
  && proof.security_definer_count === 2
  && proof.safe_path_count === 2
  && proof.trusted_owner_count === 2
  && proof.public_execute_count === 0
  && proof.anon_execute_count === 0
  && proof.authenticated_execute_count === 0
  && proof.service_execute_count === 2
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && /^[a-f0-9]{64}$/.test(proof.function_definition_sha256 || '');
if (!ok) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar runtime completo do bundle Talk X"
validar_runtime_talkx() {
RUNTIME=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
  -f scripts/db-audit/talkx-recovery-runtime.sql)
printf '%s\n' "$RUNTIME"
RUNTIME_JSON="$RUNTIME" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RUNTIME_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && proof.table_count === 2
  && proof.rls_table_count === 2
  && proof.recipient_rollout_column_count === 11
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
if (!ok) {
  console.error('Runtime Talk X pos-migration divergiu do contrato esperado.');
  process.exit(1);
}
NODE
}

# Origem YAML: etapa "Validar policy restritiva da blacklist Talk X"
validar_policy_blacklist() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
  -f scripts/db-audit/talkx-blacklist-policy-runtime.sql)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && proof.relation_count === 1
  && proof.rls_enabled === true
  && proof.policy_count === 1
  && proof.update_policy_count === 1
  && proof.authenticated_policy_count === 1
  && proof.legacy_permissive_count === 0
  && proof.restricted_policy_count === 1;
if (!ok) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar comportamento de get_team_profiles"
validar_get_team_profiles() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "
  SELECT json_build_object(
    'returned_inactive', (
      SELECT count(*) FROM public.get_team_profiles()
      WHERE is_active IS DISTINCT FROM true
    ),
    'filters_active', position(
      'where p.is_active = true' in lower(
        pg_get_functiondef('public.get_team_profiles()'::regprocedure)
      )
    ) > 0
  )::text;")
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
if (proof.returned_inactive !== 0 || proof.filters_active !== true) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar ACL de webhook_failures"
validar_acl_webhook_failures() {
node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -f scripts/db-audit/check-webhook-failures-acl.sql
}

# Origem YAML: etapa "Validar remocao de URLs assinadas persistidas"
validar_sem_urls_assinadas() {
LEGACY_COUNT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  SELECT sum(legacy_count)
  FROM (
    SELECT count(*) FILTER (WHERE media_url ~ '/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/') AS legacy_count FROM public.messages
    UNION ALL
    SELECT count(*) FILTER (WHERE media_url ~ '/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/') FROM public.scheduled_messages
    UNION ALL
    SELECT count(*) FILTER (WHERE media_url ~ '/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/') FROM public.team_messages
    UNION ALL
    SELECT count(*) FILTER (WHERE file_url ~ '/storage/v1/object/sign/(audio-messages|team-chat-files|whatsapp-media)/') FROM public.knowledge_base_files
  ) AS source_counts;
SQL
)
test "$LEGACY_COUNT" = "0"
echo "OK: nenhuma credencial temporaria de Storage permanece nas tabelas alvo."
}

# Origem YAML: etapa "Validar estrutura e privilegios da outbox CRM"
validar_outbox_estrutura() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  SELECT jsonb_build_object(
    'outbox_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_sync_outbox'::regclass),
    'links_rls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_contact_links'::regclass),
    'auth_outbox_select', has_table_privilege('authenticated', 'public.crm_sync_outbox', 'SELECT'),
    'auth_outbox_mutate', has_table_privilege('authenticated', 'public.crm_sync_outbox', 'INSERT, UPDATE, DELETE'),
    'anon_outbox_access', has_table_privilege('anon', 'public.crm_sync_outbox', 'SELECT, INSERT, UPDATE, DELETE'),
    'auth_claim_execute', has_function_privilege('authenticated', 'public.claim_crm_sync_outbox(text,integer)', 'EXECUTE'),
    'service_claim_execute', has_function_privilege('service_role', 'public.claim_crm_sync_outbox(text,integer)', 'EXECUTE'),
    'trigger_count', (
      SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.conversation_closures'::regclass
        AND tgname = 'trg_enqueue_crm_sync_from_closure' AND NOT tgisinternal
    )
  )::text;
SQL
)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
const ok = proof.outbox_rls === true
  && proof.links_rls === true
  && proof.auth_outbox_select === true
  && proof.auth_outbox_mutate === false
  && proof.anon_outbox_access === false
  && proof.auth_claim_execute === false
  && proof.service_claim_execute === true
  && proof.trigger_count === 1;
if (!ok) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar fencing e maquina de estados da outbox CRM"
validar_outbox_fencing() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  SELECT jsonb_build_object(
    'lease_column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='crm_sync_outbox' AND column_name='lease_token'
    ),
    'old_complete_absent', to_regprocedure('public.complete_crm_sync_outbox(uuid,text,text,text)') IS NULL,
    'new_complete_service', has_function_privilege(
      'service_role', 'public.complete_crm_sync_outbox(uuid,uuid,text,text,text)', 'EXECUTE'
    ),
    'new_complete_auth', has_function_privilege(
      'authenticated', 'public.complete_crm_sync_outbox(uuid,uuid,text,text,text)', 'EXECUTE'
    ),
    'contact_fk_delete_action', (
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid='public.crm_sync_outbox'::regclass
        AND conname='crm_sync_outbox_contact_id_fkey'
    ),
    'state_constraints', (
      SELECT count(*) FROM pg_constraint
      WHERE conrelid='public.crm_sync_outbox'::regclass
        AND conname IN ('crm_sync_outbox_lease_state','crm_sync_outbox_success_state','crm_sync_outbox_phone_state')
    )
  )::text;
SQL
)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
if (!(proof.lease_column === true && proof.old_complete_absent === true
  && proof.new_complete_service === true && proof.new_complete_auth === false
  && proof.contact_fk_delete_action === 'n' && proof.state_constraints === 3)) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar rollout seguro, ACL e funcoes atomicas do CRM"
validar_crm_rollout() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  WITH expected_functions AS (
    SELECT p.oid, p.proname, p.prosecdef,
           COALESCE('search_path=public, pg_temp' = ANY(p.proconfig), false) AS safe_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'merge_contacts_atomic','upsert_crm_contact_link_guarded','cleanup_crm_sync_outbox'
    )
  )
  SELECT jsonb_build_object(
    'validated_constraints', (
      SELECT count(*) FROM pg_constraint
      WHERE conrelid='public.crm_sync_outbox'::regclass AND convalidated
        AND conname IN (
          'crm_sync_outbox_payload_size','crm_sync_outbox_external_ids_bounded',
          'crm_sync_outbox_lease_state','crm_sync_outbox_success_state',
          'crm_sync_outbox_phone_state'
        )
    ),
    'safe_functions', (SELECT count(*) FROM expected_functions WHERE prosecdef AND safe_path),
    'auth_links_select', has_table_privilege('authenticated','public.crm_contact_links','SELECT'),
    'auth_links_mutate',
      has_table_privilege('authenticated','public.crm_contact_links','INSERT') OR
      has_table_privilege('authenticated','public.crm_contact_links','UPDATE') OR
      has_table_privilege('authenticated','public.crm_contact_links','DELETE') OR
      has_table_privilege('authenticated','public.crm_contact_links','TRUNCATE'),
    'anon_links_access',
      has_table_privilege('anon','public.crm_contact_links','SELECT') OR
      has_table_privilege('anon','public.crm_contact_links','INSERT') OR
      has_table_privilege('anon','public.crm_contact_links','UPDATE') OR
      has_table_privilege('anon','public.crm_contact_links','DELETE') OR
      has_table_privilege('anon','public.crm_contact_links','TRUNCATE'),
    'auth_merge', has_function_privilege(
      'authenticated','public.merge_contacts_atomic(uuid,uuid[],jsonb)','EXECUTE'
    ),
    'anon_merge', has_function_privilege(
      'anon','public.merge_contacts_atomic(uuid,uuid[],jsonb)','EXECUTE'
    ),
    'service_guarded_link', has_function_privilege(
      'service_role','public.upsert_crm_contact_link_guarded(uuid,text,text,text)','EXECUTE'
    ),
    'auth_guarded_link', has_function_privilege(
      'authenticated','public.upsert_crm_contact_link_guarded(uuid,text,text,text)','EXECUTE'
    ),
    'service_cleanup', has_function_privilege(
      'service_role','public.cleanup_crm_sync_outbox(integer,integer,integer)','EXECUTE'
    ),
    'auth_cleanup', has_function_privilege(
      'authenticated','public.cleanup_crm_sync_outbox(integer,integer,integer)','EXECUTE'
    ),
    'delete_trigger_count', (
      SELECT count(*) FROM pg_trigger
      WHERE tgrelid='public.contacts'::regclass
        AND tgname='trg_redact_crm_sync_on_contact_delete' AND NOT tgisinternal
    ),
    'runtime_flag_disabled', (
      SELECT enabled IS FALSE FROM public.feature_flags WHERE key='crm.integration'
    )
  )::text;
SQL
)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
const ok = proof.validated_constraints === 5
  && proof.safe_functions === 3
  && proof.auth_links_select === true
  && proof.auth_links_mutate === false
  && proof.anon_links_access === false
  && proof.auth_merge === true
  && proof.anon_merge === false
  && proof.service_guarded_link === true
  && proof.auth_guarded_link === false
  && proof.service_cleanup === true
  && proof.auth_cleanup === false
  && proof.delete_trigger_count === 1
  && proof.runtime_flag_disabled === true;
if (!ok) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar kill switch persistente da API publica"
validar_kill_switch() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  SELECT jsonb_build_object(
    'legacy_token_count', (
      SELECT count(*) FROM public.global_settings WHERE key='api_token'
    ),
    'constraint_count', (
      SELECT count(*) FROM pg_constraint
      WHERE conrelid='public.global_settings'::regclass
        AND conname='global_settings_no_plaintext_api_token'
        AND convalidated
        AND pg_get_constraintdef(oid) LIKE '%key <>%api_token%'
    )
  )::text;
SQL
)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
if (proof.legacy_token_count !== 0 || proof.constraint_count !== 1) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar autorizacao canonica do Inbox"
validar_inbox_canonico() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
  -f scripts/db-audit/inbox-contact-authorization-runtime.sql)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && proof.function_count === 4
  && proof.safe_function_count === 4
  && proof.definition_sha256 === '55078d2e365413bea0b93777ec63e70063def445760d0ae8f516670b86070771'
  && proof.note_rls_enabled === true
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
if (!ok) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar primitivas atomicas de mensagens e encerramento"
validar_primitivas_mensagens() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
  -f scripts/db-audit/message-delivery-phase1-runtime.sql)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && proof.message_column_count === 7
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
if (!ok) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar entrega atomica de enquetes e contatos"
validar_enquetes_contatos() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
  -f scripts/db-audit/message-delivery-phase1-runtime.sql)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && proof.function_count === 9
  && proof.safe_api_function_count === 6
  && proof.trusted_owner_function_count === 9
  && proof.function_name_collision_count === 0
  && proof.definition_sha256 === '46d8cea7dd5ece11089f79f8bd06552d0b6004e912aeaf4b28e3c4cdb43811ab'
  && proof.authenticated_rich_enqueue_effective === true
  && proof.authenticated_rich_enqueue_direct === true
  && proof.service_rich_enqueue_effective === false
  && proof.service_rich_enqueue_direct === false
  && proof.anon_any_execute === false;
if (!ok) process.exit(1);
NODE
}

# Origem YAML: etapa "Validar histórico canônico de templates Talk X"
validar_templates_talkx() {
RESULT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At \
  -f scripts/db-audit/talkx-template-history-runtime.sql)
printf '%s\n' "$RESULT"
RESULT_JSON="$RESULT" node --input-type=module <<'NODE'
const proof = JSON.parse(process.env.RESULT_JSON);
const ok = proof.server_major === 17
  && proof.database === 'postgres'
  && /^[a-f0-9]{64}$/.test(proof.runtime_sha256 || '')
  && proof.table_count === 1
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
  && proof.foundation_constraint_count === 4
  && proof.history_saved_by_fk_no_action_count === 0
  && proof.history_saved_by_fk_set_null_count === 1
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
if (!ok) process.exit(1);
NODE

      - name: Provar paridade integral apos aplicacao
}

despachar() {
  case "${TARGET_VERSION:?TARGET_VERSION ausente}" in
    20260909270000)
      validar_ledger_entrega_atomica
      validar_enquetes_contatos
      ;;
    20260912130000|20260912140000)
      validar_ledger_recuperacao_talkx
      validar_runtime_talkx
      ;;
    20260922220000)
      validar_runtime_chamadas_sentimento
      ;;
    20260910100000)
      validar_policy_blacklist
      ;;
    20260830170000)
      validar_get_team_profiles
      ;;
    20260831120000)
      validar_acl_webhook_failures
      ;;
    20260831150000)
      validar_sem_urls_assinadas
      ;;
    20260908180000)
      validar_outbox_estrutura
      ;;
    20260908220000)
      validar_outbox_fencing
      ;;
    20260909120000)
      validar_crm_rollout
      ;;
    20260909180000)
      validar_kill_switch
      ;;
    20260909200000)
      validar_inbox_canonico
      ;;
    20260909220000|20260909240000)
      validar_primitivas_mensagens
      ;;
    20260909210000|20260909230000)
      validar_templates_talkx
      ;;
    *)
      echo "post-apply: sem validacao historica para $TARGET_VERSION (contrato generico ja cobriu o pre-push)."
      ;;
  esac
}

despachar
