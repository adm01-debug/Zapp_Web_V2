# public.conversation_closures

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `closed_by` | `uuid` | sim |  |  |  |
| 4 | `close_reason` | `text` | não |  |  |  |
| 5 | `outcome` | `text` | sim |  |  |  |
| 6 | `classification` | `text` | sim |  |  |  |
| 7 | `notes` | `text` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `client_request_id` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| conversation_closures_closed_by_fkey | FOREIGN KEY | `FOREIGN KEY (closed_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| conversation_closures_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| conversation_closures_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.conversation_events | conversation_events_closure_id_fkey | closure_id | CASCADE |
| public.crm_sync_outbox | crm_sync_outbox_closure_id_fkey | closure_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| conversation_closures_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX conversation_closures_pkey ON public.conversation_closures USING btree (id)` |
| idx_closures_contact | btree | contact_id | não | sim |  | `CREATE INDEX idx_closures_contact ON public.conversation_closures USING btree (contact_id)` |
| idx_closures_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_closures_created_at ON public.conversation_closures USING btree (created_at DESC)` |
| idx_closures_created_contact | btree | created_at, contact_id | não | sim |  | `CREATE INDEX idx_closures_created_contact ON public.conversation_closures USING btree (created_at, contact_id)` |
| idx_closures_reason | btree | close_reason | não | sim |  | `CREATE INDEX idx_closures_reason ON public.conversation_closures USING btree (close_reason)` |
| idx_conversation_closures_closed_by | btree | closed_by | não | sim |  | `CREATE INDEX idx_conversation_closures_closed_by ON public.conversation_closures USING btree (closed_by)` |
| ux_conversation_closures_contact_request | btree | contact_id, client_request_id | sim | sim | `(client_request_id IS NOT NULL)` | `CREATE UNIQUE INDEX ux_conversation_closures_contact_request ON public.conversation_closures USING btree (contact_id, client_request_id) WHERE (client_request_id IS NOT NULL)` |


## Policies (RLS)

### `Agents can create closures for their contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_contact_visible_to_user(contact_id, auth.uid())` |

### `Agents or admins can view closures`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_enqueue_crm_sync_from_closure | AFTER | INSERT | ROW | enabled | public.enqueue_crm_sync_from_closure |
| trg_gamification_on_closure | AFTER | INSERT OR UPDATE | ROW | enabled | public.handle_conversation_closure_gamification |
| trg_guard_conversation_closure_request_id | BEFORE | INSERT OR UPDATE | ROW | enabled | public.guard_conversation_closure_request_id |
| trg_reject_repeated_conversation_closure_without_reopen | BEFORE | INSERT | ROW | enabled | public.reject_repeated_conversation_closure_without_reopen |
| trg_sync_contact_status_on_closure | AFTER | INSERT | ROW | enabled | public.sync_contact_status_on_closure |


## Grants

_nenhum_
