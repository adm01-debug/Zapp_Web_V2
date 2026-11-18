# public.conversation_events

> Linha do tempo de uma conversa: transferencias de agente/fila, abertura/fechamento e demais transicoes, com quem executou (performed_by) e metadata.

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
| 3 | `event_type` | `text` | não |  |  |  |
| 4 | `from_agent_id` | `uuid` | sim |  |  |  |
| 5 | `to_agent_id` | `uuid` | sim |  |  |  |
| 6 | `from_queue_id` | `uuid` | sim |  |  |  |
| 7 | `to_queue_id` | `uuid` | sim |  |  |  |
| 8 | `metadata` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 9 | `performed_by` | `uuid` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `closure_id` | `uuid` | sim |  |  | FK for the single close event produced by an atomic closure. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| conversation_events_closure_id_fkey | FOREIGN KEY | `FOREIGN KEY (closure_id) REFERENCES conversation_closures(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| conversation_events_closure_type_check | CHECK | `CHECK (closure_id IS NULL OR event_type = 'close'::text)` |  |  | sim |
| conversation_events_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| conversation_events_from_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (from_agent_id) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| conversation_events_from_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (from_queue_id) REFERENCES queues(id)` | NO ACTION | NO ACTION | sim |
| conversation_events_performed_by_fkey | FOREIGN KEY | `FOREIGN KEY (performed_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| conversation_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| conversation_events_to_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (to_agent_id) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| conversation_events_to_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (to_queue_id) REFERENCES queues(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| conversation_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX conversation_events_pkey ON public.conversation_events USING btree (id)` |
| idx_conversation_events_contact | btree | contact_id, created_at | não | sim |  | `CREATE INDEX idx_conversation_events_contact ON public.conversation_events USING btree (contact_id, created_at DESC)` |
| idx_conversation_events_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_conversation_events_contact_id ON public.conversation_events USING btree (contact_id)` |
| idx_conversation_events_from_agent_id | btree | from_agent_id | não | sim |  | `CREATE INDEX idx_conversation_events_from_agent_id ON public.conversation_events USING btree (from_agent_id)` |
| idx_conversation_events_from_queue_id | btree | from_queue_id | não | sim |  | `CREATE INDEX idx_conversation_events_from_queue_id ON public.conversation_events USING btree (from_queue_id)` |
| idx_conversation_events_performed_by | btree | performed_by | não | sim |  | `CREATE INDEX idx_conversation_events_performed_by ON public.conversation_events USING btree (performed_by)` |
| idx_conversation_events_to_agent_id | btree | to_agent_id | não | sim |  | `CREATE INDEX idx_conversation_events_to_agent_id ON public.conversation_events USING btree (to_agent_id)` |
| idx_conversation_events_to_queue_id | btree | to_queue_id | não | sim |  | `CREATE INDEX idx_conversation_events_to_queue_id ON public.conversation_events USING btree (to_queue_id)` |
| idx_conversation_events_type | btree | event_type | não | sim |  | `CREATE INDEX idx_conversation_events_type ON public.conversation_events USING btree (event_type)` |
| idx_events_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_events_created_at ON public.conversation_events USING btree (created_at DESC)` |
| ux_conversation_events_closure_id | btree | closure_id | sim | sim | `(closure_id IS NOT NULL)` | `CREATE UNIQUE INDEX ux_conversation_events_closure_id ON public.conversation_events USING btree (closure_id) WHERE (closure_id IS NOT NULL)` |


## Policies (RLS)

### `Authorized users can insert events`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_contact_visible_to_user(contact_id, auth.uid()) AND (is_admin_or_supervisor(auth.uid()) OR (NOT (performed_by IS DISTINCT FROM current_profile_id()))))` |

### `conversation_events_select_policy`

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
| trg_conversation_event_assign_performed_by | BEFORE | INSERT | ROW | enabled | public.conversation_event_assign_performed_by |
| trg_conversation_events_default_performed_by | BEFORE | INSERT | ROW | enabled | public.conversation_events_default_performed_by |
| trg_guard_conversation_event_closure_id | BEFORE | INSERT OR UPDATE | ROW | enabled | public.guard_conversation_event_closure_id |


## Grants

_nenhum_
