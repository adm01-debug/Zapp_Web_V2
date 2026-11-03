# public.multiplix_recipients

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | sim |
| policies | 2 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `dispatch_id` | `uuid` | não |  |  |  |
| 3 | `company_id` | `uuid` | não |  |  |  |
| 4 | `company_name_snapshot` | `text` | sim |  |  |  |
| 5 | `destino_e164` | `text` | sim |  |  |  |
| 6 | `destino_origem` | `text` | sim |  |  |  |
| 7 | `personalized_message` | `text` | sim |  |  |  |
| 8 | `status` | `multiplix_recipient_status` | não | `'pending'::multiplix_recipient_status` |  |  |
| 9 | `sent_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `delivered_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `error_message` | `text` | sim |  |  |  |
| 12 | `delivery_claim_token` | `uuid` | sim |  |  |  |
| 13 | `delivery_claimed_at` | `timestamp with time zone` | sim |  |  |  |
| 14 | `delivery_claim_expires_at` | `timestamp with time zone` | sim |  |  |  |
| 15 | `delivery_claimed_by` | `text` | sim |  |  |  |
| 16 | `delivery_attempt_count` | `integer` | não | `0` |  |  |
| 17 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 18 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 19 | `attempt_count` | `integer` | não | `0` |  |  |
| 20 | `retry_after` | `timestamp with time zone` | sim |  |  |  |
| 21 | `provider_dispatch_started_at` | `timestamp with time zone` | sim |  |  |  |
| 22 | `external_id` | `text` | sim |  |  |  |
| 23 | `singu_contact_id` | `uuid` | sim |  |  |  |
| 24 | `eligibility` | `multiplix_eligibility` | não | `'eligible'::multiplix_eligibility` |  |  |
| 25 | `eligibility_reason` | `text` | sim |  |  |  |
| 26 | `variables_snapshot` | `jsonb` | sim |  |  |  |
| 27 | `audience_version` | `integer` | sim |  |  |  |
| 28 | `inclusion_reason` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_recipients_delivery_claim_state | CHECK | `CHECK (status = 'sending'::multiplix_recipient_status AND delivery_claim_token IS NOT NULL AND delivery_claimed_at IS NOT NULL AND delivery_claim_expires_at IS NOT NULL AND delivery_claimed_by IS NOT NULL OR status <> 'sending'::multiplix_recipient_status AND delivery_claim_token IS NULL AND delivery_claimed_at IS NULL AND delivery_claim_expires_at IS NULL AND delivery_claimed_by IS NULL)` |  |  | sim |
| multiplix_recipients_dispatch_destino_key | UNIQUE | `UNIQUE NULLS NOT DISTINCT (dispatch_id, destino_e164)` |  |  | sim |
| multiplix_recipients_dispatch_id_fkey | FOREIGN KEY | `FOREIGN KEY (dispatch_id) REFERENCES multiplix_dispatches(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| multiplix_recipients_external_id_bounded | CHECK | `CHECK (external_id IS NULL OR length(btrim(external_id)) >= 1 AND length(btrim(external_id)) <= 512)` |  |  | sim |
| multiplix_recipients_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.multiplix_delivery_items | multiplix_delivery_items_recipient_id_fkey | recipient_id | CASCADE |
| public.multiplix_events | multiplix_events_recipient_id_fkey | recipient_id | RESTRICT |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_recipients_dispatch_id | btree | dispatch_id | não | sim |  | `CREATE INDEX idx_multiplix_recipients_dispatch_id ON public.multiplix_recipients USING btree (dispatch_id)` |
| idx_multiplix_recipients_external_id | btree | external_id | sim | sim | `(external_id IS NOT NULL)` | `CREATE UNIQUE INDEX idx_multiplix_recipients_external_id ON public.multiplix_recipients USING btree (external_id) WHERE (external_id IS NOT NULL)` |
| idx_multiplix_recipients_pending | btree | dispatch_id | não | sim | `(status = 'pending'::multiplix_recipient_status)` | `CREATE INDEX idx_multiplix_recipients_pending ON public.multiplix_recipients USING btree (dispatch_id) WHERE (status = 'pending'::multiplix_recipient_status)` |
| multiplix_recipients_dispatch_destino_key | btree | dispatch_id, destino_e164 | sim | sim |  | `CREATE UNIQUE INDEX multiplix_recipients_dispatch_destino_key ON public.multiplix_recipients USING btree (dispatch_id, destino_e164) NULLS NOT DISTINCT` |
| multiplix_recipients_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_recipients_pkey ON public.multiplix_recipients USING btree (id)` |


## Policies (RLS)

### `Users can delete recipients of own draft dispatches`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_recipients.dispatch_id) AND (md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) AND (md.status = 'draft'::multiplix_dispatch_status)))))` |
| WITH CHECK |  |

### `Users can view recipients of accessible dispatches`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_recipients.dispatch_id) AND ((md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| enforce_multiplix_recipient_mutability | BEFORE | INSERT OR DELETE OR UPDATE | ROW | enabled | public.enforce_multiplix_recipient_mutability |
| update_multiplix_recipients_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
