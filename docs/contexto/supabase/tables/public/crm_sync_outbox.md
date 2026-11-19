# public.crm_sync_outbox

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 1 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `closure_id` | `uuid` | sim |  |  |  |
| 3 | `contact_id` | `uuid` | sim |  |  |  |
| 4 | `idempotency_key` | `text` | não |  |  |  |
| 5 | `normalized_phone` | `text` | sim |  |  |  |
| 6 | `payload` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 7 | `status` | `text` | não | `'pending'::text` |  |  |
| 8 | `attempt_count` | `integer` | não | `0` |  |  |
| 9 | `max_attempts` | `integer` | não | `8` |  |  |
| 10 | `available_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `locked_at` | `timestamp with time zone` | sim |  |  |  |
| 12 | `locked_by` | `text` | sim |  |  |  |
| 13 | `last_error_code` | `text` | sim |  |  |  |
| 14 | `external_interaction_id` | `text` | sim |  |  |  |
| 15 | `external_contact_id` | `text` | sim |  |  |  |
| 16 | `external_company_id` | `text` | sim |  |  |  |
| 17 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 18 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 19 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 20 | `lease_token` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| crm_sync_outbox_attempt_count_check | CHECK | `CHECK (attempt_count >= 0)` |  |  | sim |
| crm_sync_outbox_closure_id_fkey | FOREIGN KEY | `FOREIGN KEY (closure_id) REFERENCES conversation_closures(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| crm_sync_outbox_closure_id_key | UNIQUE | `UNIQUE (closure_id)` |  |  | sim |
| crm_sync_outbox_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| crm_sync_outbox_external_ids_bounded | CHECK | `CHECK ((external_interaction_id IS NULL OR length(external_interaction_id) >= 1 AND length(external_interaction_id) <= 200) AND (external_contact_id IS NULL OR length(external_contact_id) >= 1 AND length(external_contact_id) <= 200) AND (external_company_id IS NULL OR length(external_company_id) >= 1 AND length(external_company_id) <= 200))` |  |  | sim |
| crm_sync_outbox_idempotency_key_key | UNIQUE | `UNIQUE (idempotency_key)` |  |  | sim |
| crm_sync_outbox_lease_state | CHECK | `CHECK (status = 'processing'::text AND locked_at IS NOT NULL AND locked_by IS NOT NULL AND lease_token IS NOT NULL OR status <> 'processing'::text AND locked_at IS NULL AND locked_by IS NULL AND lease_token IS NULL)` |  |  | sim |
| crm_sync_outbox_max_attempts_check | CHECK | `CHECK (max_attempts >= 1 AND max_attempts <= 20)` |  |  | sim |
| crm_sync_outbox_normalized_phone_check | CHECK | `CHECK (normalized_phone ~ '^[0-9]{8,15}$'::text)` |  |  | sim |
| crm_sync_outbox_payload_check | CHECK | `CHECK (jsonb_typeof(payload) = 'object'::text)` |  |  | sim |
| crm_sync_outbox_payload_size | CHECK | `CHECK (octet_length(payload::text) <= 20000)` |  |  | sim |
| crm_sync_outbox_phone_state | CHECK | `CHECK (normalized_phone IS NOT NULL OR status = 'dead_letter'::text AND (last_error_code = ANY (ARRAY['INVALID_PHONE'::text, 'CONTACT_DELETED'::text])))` |  |  | sim |
| crm_sync_outbox_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| crm_sync_outbox_status_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'succeeded'::text, 'failed'::text, 'dead_letter'::text]))` |  |  | sim |
| crm_sync_outbox_success_state | CHECK | `CHECK (status <> 'succeeded'::text OR completed_at IS NOT NULL AND external_interaction_id IS NOT NULL AND external_contact_id IS NOT NULL)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| crm_sync_outbox_closure_id_key | btree | closure_id | sim | sim |  | `CREATE UNIQUE INDEX crm_sync_outbox_closure_id_key ON public.crm_sync_outbox USING btree (closure_id)` |
| crm_sync_outbox_idempotency_key_key | btree | idempotency_key | sim | sim |  | `CREATE UNIQUE INDEX crm_sync_outbox_idempotency_key_key ON public.crm_sync_outbox USING btree (idempotency_key)` |
| crm_sync_outbox_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX crm_sync_outbox_pkey ON public.crm_sync_outbox USING btree (id)` |
| idx_crm_sync_outbox_contact | btree | contact_id | não | sim | `(contact_id IS NOT NULL)` | `CREATE INDEX idx_crm_sync_outbox_contact ON public.crm_sync_outbox USING btree (contact_id) WHERE (contact_id IS NOT NULL)` |
| idx_crm_sync_outbox_ready | btree | available_at, created_at | não | sim | `(status = ANY (ARRAY['pending'::text, 'failed'::text]))` | `CREATE INDEX idx_crm_sync_outbox_ready ON public.crm_sync_outbox USING btree (available_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]))` |
| idx_crm_sync_outbox_stale | btree | locked_at, created_at | não | sim | `(status = 'processing'::text)` | `CREATE INDEX idx_crm_sync_outbox_stale ON public.crm_sync_outbox USING btree (locked_at, created_at) WHERE (status = 'processing'::text)` |
| idx_crm_sync_outbox_status_completed | btree | status, completed_at | não | sim | `(status = ANY (ARRAY['succeeded'::text, 'dead_letter'::text]))` | `CREATE INDEX idx_crm_sync_outbox_status_completed ON public.crm_sync_outbox USING btree (status, completed_at DESC) WHERE (status = ANY (ARRAY['succeeded'::text, 'dead_letter'::text]))` |


## Policies (RLS)

### `Admins inspect CRM sync outbox`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
