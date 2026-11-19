# public.multiplix_delivery_items

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
| 2 | `dispatch_id` | `uuid` | não |  |  |  |
| 3 | `recipient_id` | `uuid` | não |  |  |  |
| 4 | `block_id` | `uuid` | não |  |  |  |
| 5 | `dispatch_version` | `integer` | não |  |  |  |
| 6 | `status` | `multiplix_item_status` | não | `'pending'::multiplix_item_status` |  |  |
| 7 | `attempt_count` | `integer` | não | `0` |  |  |
| 8 | `next_attempt_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `lease_token` | `uuid` | sim |  |  |  |
| 10 | `lease_until` | `timestamp with time zone` | sim |  |  |  |
| 11 | `worker_id` | `text` | sim |  |  |  |
| 12 | `external_id` | `text` | sim |  |  |  |
| 13 | `personalized_message` | `text` | sim |  |  |  |
| 14 | `provider_dispatch_started_at` | `timestamp with time zone` | sim |  |  |  |
| 15 | `idempotency_key` | `text` | sim | `encode(extensions.digest((((((((dispatch_id)::text \|\| ':'::text) \|\| (dispatch_version)::text) \|\| ':'::text) \|\| (recipient_id)::text) \|\| ':'::text) \|\| (block_id)::text), 'sha256'::text), 'hex'::text)` | s |  |
| 16 | `error_class` | `text` | sim |  |  |  |
| 17 | `error_message` | `text` | sim |  |  |  |
| 18 | `sent_at` | `timestamp with time zone` | sim |  |  |  |
| 19 | `delivered_at` | `timestamp with time zone` | sim |  |  |  |
| 20 | `read_at` | `timestamp with time zone` | sim |  |  |  |
| 21 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 22 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 23 | `replied_at` | `timestamp with time zone` | sim |  |  | F52/F62: instante da resposta do contato correlacionada a este item (ortogonal ao status). |
| 24 | `reply_attribution` | `text` | sim |  |  | F62: linked (external_id casou) \| inferred (janela + numero). NULL enquanto sem resposta. |
| 25 | `voice_asset_id` | `uuid` | sim |  |  | F65: ativo de voz (multiplix_voice_assets) que o envio deste item usa. Preenchido pelo prepare; NULL em bloco de voz ainda nao renderizado (o item segura a fila, ver F69). |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_delivery_items_block_id_fkey | FOREIGN KEY | `FOREIGN KEY (block_id) REFERENCES multiplix_blocks(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| multiplix_delivery_items_dispatch_id_fkey | FOREIGN KEY | `FOREIGN KEY (dispatch_id) REFERENCES multiplix_dispatches(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| multiplix_delivery_items_idempotency_key_key | UNIQUE | `UNIQUE (idempotency_key)` |  |  | sim |
| multiplix_delivery_items_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| multiplix_delivery_items_recipient_id_fkey | FOREIGN KEY | `FOREIGN KEY (recipient_id) REFERENCES multiplix_recipients(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| multiplix_delivery_items_reply_attribution_check | CHECK | `CHECK (reply_attribution IS NULL OR (reply_attribution = ANY (ARRAY['linked'::text, 'inferred'::text])))` |  |  | sim |
| multiplix_delivery_items_voice_asset_id_fkey | FOREIGN KEY | `FOREIGN KEY (voice_asset_id) REFERENCES multiplix_voice_assets(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_delivery_items_block_id | btree | block_id | não | sim |  | `CREATE INDEX idx_multiplix_delivery_items_block_id ON public.multiplix_delivery_items USING btree (block_id)` |
| idx_multiplix_delivery_items_dispatch_replied | btree | dispatch_id | não | sim | `(replied_at IS NOT NULL)` | `CREATE INDEX idx_multiplix_delivery_items_dispatch_replied ON public.multiplix_delivery_items USING btree (dispatch_id) WHERE (replied_at IS NOT NULL)` |
| idx_multiplix_delivery_items_dispatch_status | btree | dispatch_id, status | não | sim |  | `CREATE INDEX idx_multiplix_delivery_items_dispatch_status ON public.multiplix_delivery_items USING btree (dispatch_id, status)` |
| idx_multiplix_delivery_items_queue | btree | status, next_attempt_at | não | sim | `(status = ANY (ARRAY['pending'::multiplix_item_status, 'failed_transient'::multiplix_item_status]))` | `CREATE INDEX idx_multiplix_delivery_items_queue ON public.multiplix_delivery_items USING btree (status, next_attempt_at) WHERE (status = ANY (ARRAY['pending'::multiplix_item_status, 'failed_transient'::multiplix_item_status]))` |
| idx_multiplix_delivery_items_recipient_id | btree | recipient_id | não | sim |  | `CREATE INDEX idx_multiplix_delivery_items_recipient_id ON public.multiplix_delivery_items USING btree (recipient_id)` |
| idx_multiplix_delivery_items_voice_asset_id | btree | voice_asset_id | não | sim |  | `CREATE INDEX idx_multiplix_delivery_items_voice_asset_id ON public.multiplix_delivery_items USING btree (voice_asset_id)` |
| multiplix_delivery_items_idempotency_key_key | btree | idempotency_key | sim | sim |  | `CREATE UNIQUE INDEX multiplix_delivery_items_idempotency_key_key ON public.multiplix_delivery_items USING btree (idempotency_key)` |
| multiplix_delivery_items_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_delivery_items_pkey ON public.multiplix_delivery_items USING btree (id)` |


## Policies (RLS)

### `Users can view delivery items of accessible dispatches`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM multiplix_dispatches md   WHERE ((md.id = multiplix_delivery_items.dispatch_id) AND ((md.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_multiplix_delivery_items_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
