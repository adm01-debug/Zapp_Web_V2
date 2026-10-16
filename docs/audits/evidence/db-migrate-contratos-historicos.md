# Contratos historicos do `db-migrate.yml` (E62)

Gerado por `scripts/db-audit/extrair-contratos-runtime.mjs` a partir de `origin/main`.
Cada contrato e o corpo de um braco do `case "$TARGET_VERSION"` do passo
`Provar estado runtime antes do push`, extraido **sem alteracao de texto**.

## Por que isto existe

O passo e a rede de protecao que roda **antes** de aplicar uma migration em producao:
extrai o fingerprint do estado runtime do alvo e o compara ao `CONFIRM_RUNTIME_SHA256`
(composicao da E64). Reduzir o workflow a ~150 linhas so e seguro se a **mesma consulta**
continuar rodando, agora vinda de um arquivo. Por isso a equivalencia aqui e textual:
o arquivo e o braco de origem tem o mesmo `sha256`.

## Como reexecutar um contrato sob demanda

Não envie esses arquivos diretamente ao psql: os contratos históricos contêm
invocações de shell. O executor extrai somente SQL e flags permitidos, sem eval:

```bash
node scripts/db-audit/run-runtime-contract.mjs <versao>
```

## Contratos

| versao | arquivo | linhas uteis | linhas de origem | sha256 (texto extraido) |
| --- | --- | --- | --- | --- |
| `20260830170000` | `scripts/db-audit/contracts/20260830170000.sql` | 20 | 244–264 | `0adcbf9285fc4908...` |
| `20260831120000` | `scripts/db-audit/contracts/20260831120000.sql` | 47 | 266–313 | `ff0d991fe7095387...` |
| `20260831150000` | `scripts/db-audit/contracts/20260831150000.sql` | 26 | 315–341 | `271463d5594495d9...` |
| `20260908180000` | `scripts/db-audit/contracts/20260908180000.sql` | 43 | 343–386 | `446be95237a11725...` |
| `20260908220000` | `scripts/db-audit/contracts/20260908220000.sql` | 34 | 388–422 | `e61d2449d3331457...` |
| `20260909120000` | `scripts/db-audit/contracts/20260909120000.sql` | 51 | 424–475 | `ac5c4113aacde1de...` |
| `20260909180000` | `scripts/db-audit/contracts/20260909180000.sql` | 31 | 477–508 | `b2ab1a7202b365ca...` |
| `20260909200000` | `scripts/db-audit/contracts/20260909200000.sql` | 2 | 510–512 | `bf9709eda3b8c1e0...` |
| `20260909210000` | `scripts/db-audit/contracts/20260909210000.sql` | 6 | 514–520 | `cd4724857df6407f...` |
| `20260909230000` | `scripts/db-audit/contracts/20260909230000.sql` | 2 | 522–524 | `fb230326e8b7f686...` |
| `20260910100000` | `scripts/db-audit/contracts/20260910100000.sql` | 6 | 526–532 | `6dd1987ac487f4de...` |
| `20260922220000` | `scripts/db-audit/contracts/20260922220000.sql` | 7 | 534–548 | `9251f8da09165d20...` |

Total: **12** contratos, 275 linhas uteis extraidas do workflow.

### Extensão do lote de 05/10, reconciliada em 16/10

O 13º arquivo, `scripts/db-audit/contracts/20261004195051.sql`, delega ao SQL
canônico `scripts/db-audit/generic-migration-runtime.sql` (o conteúdo anterior
era idêntico a esse SQL, mas não tinha a invocação exigida pelo parser).
SHA-256 do texto, sem newline final:
`dfd9dc94af58553effe1ab820b4392800a6dd0619ad4b3cfaae35511a5a978f6`.
Isso corrige a resolução de contratos sem alterar o SQL consultado nem afirmar
que o lote novo de 880 cartões foi aplicado.

---

# Validações pós-apply históricas arquivadas (W31)

Estas 17 validações pós-apply foram removidas de `.github/workflows/db-migrate.yml` (linhas 1096–1620)
em 2026-10-15 (W31). Cada uma rodava condicionalmente (`if: inputs.migration_version == '...'`) e
verifica invariantes que já não mudam: as migrations alvo foram aplicadas em produção e não podem ser
revertidas. São preservadas aqui para auditoria e reexecução manual se necessário.

## Como reexecutar

Cada validação abaixo usa `node scripts/db-audit/psql-safe.mjs` (wrapper em torno do psql com
`SUPABASE_DB_URL` configurado) ou um arquivo SQL externo em `scripts/db-audit/`. Para reexecutar
qualquer uma em produção, configure `SUPABASE_DB_URL` com a URL de conexão e execute o bloco
`run:` correspondente.

---

## 1. Validar ledger completo do bundle de entrega atomica
**Condição:** `inputs.migration_version == '20260909270000'`

```bash
BUNDLE_COUNT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  SELECT count(*)
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20260909250000', '20260909260000', '20260909270000');
SQL
)
test "$BUNDLE_COUNT" = "3"
echo "OK: ledger possui todas as tres migrations do contrato atomico."
```

---

## 2. Validar ledger completo do pacote do lote de 05/10
**Condição:** `inputs.migration_version == '20261004195051'`

```bash
BUNDLE_COUNT=$(node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At <<'SQL'
  SELECT count(*)
  FROM supabase_migrations.schema_migrations
  WHERE version IN (
    '20261003272707',
    '20261004172554',
    '20261004173439',
    '20261004181921',
    '20261004182245',
    '20261004185228',
    '20261004190606',
    '20261004195051'
  );
SQL
)
test "$BUNDLE_COUNT" = "8"
echo "OK: ledger possui as 8 migrations do lote de 05/10."
```

---

## 3. Validar ledger completo do bundle de recuperacao Talk X
**Condição:** `inputs.migration_version == '20260912130000' || '20260912140000'`

```bash
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
```

---

## 4. Validar runtime atomico de chamadas e sentimento
**Condição:** `inputs.migration_version == '20260922220000'`

```bash
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
```

---

## 5. Validar runtime completo do bundle Talk X
**Condição:** `inputs.migration_version == '20260912130000' || '20260912140000'`

```bash
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
```

---

## 6. Validar policy restritiva da blacklist Talk X
**Condição:** `inputs.migration_version == '20260910100000'`

```bash
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
```

---

## 7. Validar comportamento de get_team_profiles
**Condição:** `inputs.migration_version == '20260830170000'`

```bash
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
```

---

## 8. Validar ACL de webhook_failures
**Condição:** `inputs.migration_version == '20260831120000'`

```bash
node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 \
  -f scripts/db-audit/check-webhook-failures-acl.sql
```

---

## 9. Validar remocao de URLs assinadas persistidas
**Condição:** `inputs.migration_version == '20260831150000'`

```bash
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
```

---

## 10. Validar estrutura e privilegios da outbox CRM
**Condição:** `inputs.migration_version == '20260908180000'`

```bash
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
```

---

## 11. Validar fencing e maquina de estados da outbox CRM
**Condição:** `inputs.migration_version == '20260908220000'`

```bash
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
```

---

## 12. Validar rollout seguro, ACL e funcoes atomicas do CRM
**Condição:** `inputs.migration_version == '20260909120000'`

```bash
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
    'auth_merge', has_function_privilege('authenticated','public.merge_contacts_atomic(uuid,uuid[],jsonb)','EXECUTE'),
    'anon_merge', has_function_privilege('anon','public.merge_contacts_atomic(uuid,uuid[],jsonb)','EXECUTE'),
    'service_guarded_link', has_function_privilege('service_role','public.upsert_crm_contact_link_guarded(uuid,text,text,text)','EXECUTE'),
    'auth_guarded_link', has_function_privilege('authenticated','public.upsert_crm_contact_link_guarded(uuid,text,text,text)','EXECUTE'),
    'service_cleanup', has_function_privilege('service_role','public.cleanup_crm_sync_outbox(integer,integer,integer)','EXECUTE'),
    'auth_cleanup', has_function_privilege('authenticated','public.cleanup_crm_sync_outbox(integer,integer,integer)','EXECUTE'),
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
```

---

## 13. Validar kill switch persistente da API publica
**Condição:** `inputs.migration_version == '20260909180000'`

```bash
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
```

---

## 14. Validar autorizacao canonica do Inbox
**Condição:** `inputs.migration_version == '20260909200000'`

```bash
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
```

---

## 15. Validar primitivas atomicas de mensagens e encerramento
**Condição:** `inputs.migration_version == '20260909220000' || '20260909240000'`

```bash
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
```

---

## 16. Validar entrega atomica de enquetes e contatos
**Condição:** `inputs.migration_version == '20260909270000'`

```bash
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
```

---

## 17. Validar historico canonico de templates Talk X
**Condição:** `inputs.migration_version == '20260909210000' || '20260909230000'`

```bash
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
```

---

*Arquivado em 2026-10-15 por W31 (remoção das validações pós-apply históricas do workflow).*
