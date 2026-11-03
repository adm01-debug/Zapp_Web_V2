# public.conversation_tasks

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | sim |  |  |  |
| 3 | `title` | `text` | não |  |  |  |
| 4 | `description` | `text` | sim |  |  |  |
| 5 | `assigned_to` | `uuid` | sim |  |  |  |
| 6 | `created_by` | `uuid` | não |  |  |  |
| 7 | `due_date` | `timestamp with time zone` | sim |  |  |  |
| 8 | `priority` | `text` | não | `'medium'::text` |  |  |
| 9 | `status` | `text` | não | `'backlog'::text` |  |  |
| 10 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `remind_at` | `timestamp with time zone` | sim |  |  |  |
| 14 | `notified_at` | `timestamp with time zone` | sim |  |  |  |
| 15 | `waiting_reason` | `text` | sim |  |  |  |
| 16 | `position` | `integer` | não | `0` |  |  |
| 17 | `started_at` | `timestamp with time zone` | sim |  |  |  |
| 18 | `status_changed_at` | `timestamp with time zone` | não | `now()` |  |  |
| 19 | `client_task_id` | `uuid` | sim |  |  | IA-047: chave idempotente do clique de criação de tarefa (ux_conversation_tasks_creator_client_key: created_by+client_task_id único, parcial). |
| 20 | `migrated_from_reminder_id` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| conversation_tasks_assigned_to_fkey | FOREIGN KEY | `FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| conversation_tasks_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| conversation_tasks_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| conversation_tasks_migrated_from_reminder_id_fkey | FOREIGN KEY | `FOREIGN KEY (migrated_from_reminder_id) REFERENCES reminders(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| conversation_tasks_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| conversation_tasks_status_check | CHECK | `CHECK (status = ANY (ARRAY['backlog'::text, 'todo'::text, 'doing'::text, 'waiting'::text, 'done'::text, 'cancelled'::text]))` |  |  | sim |
| conversation_tasks_waiting_reason_check | CHECK | `CHECK (status <> 'waiting'::text OR waiting_reason IS NOT NULL)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.reminders | reminders_migrated_task_id_fkey | migrated_task_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| conversation_tasks_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX conversation_tasks_pkey ON public.conversation_tasks USING btree (id)` |
| idx_conversation_tasks_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_conversation_tasks_created_by ON public.conversation_tasks USING btree (created_by)` |
| idx_conversation_tasks_owner_status_completed | btree | created_by, status, completed_at | não | sim |  | `CREATE INDEX idx_conversation_tasks_owner_status_completed ON public.conversation_tasks USING btree (created_by, status, completed_at)` |
| idx_conversation_tasks_owner_status_position | btree | created_by, status, position | não | sim |  | `CREATE INDEX idx_conversation_tasks_owner_status_position ON public.conversation_tasks USING btree (created_by, status, "position")` |
| idx_tasks_assigned | btree | assigned_to | não | sim |  | `CREATE INDEX idx_tasks_assigned ON public.conversation_tasks USING btree (assigned_to)` |
| idx_tasks_contact | btree | contact_id | não | sim |  | `CREATE INDEX idx_tasks_contact ON public.conversation_tasks USING btree (contact_id)` |
| idx_tasks_owner_remind_pending | btree | created_by, remind_at | não | sim | `((remind_at IS NOT NULL) AND (notified_at IS NULL) AND (status <> ALL (ARRAY['done'::text, 'cancelled'::text])))` | `CREATE INDEX idx_tasks_owner_remind_pending ON public.conversation_tasks USING btree (created_by, remind_at) WHERE ((remind_at IS NOT NULL) AND (notified_at IS NULL) AND (status <> ALL (ARRAY['done'::text, 'cancelled'::text])))` |
| idx_tasks_owner_status_due | btree | created_by, status, due_date | não | sim |  | `CREATE INDEX idx_tasks_owner_status_due ON public.conversation_tasks USING btree (created_by, status, due_date)` |
| idx_tasks_status | btree | status | não | sim |  | `CREATE INDEX idx_tasks_status ON public.conversation_tasks USING btree (status)` |
| uq_conversation_tasks_migrated_from_reminder | btree | migrated_from_reminder_id | sim | sim | `(migrated_from_reminder_id IS NOT NULL)` | `CREATE UNIQUE INDEX uq_conversation_tasks_migrated_from_reminder ON public.conversation_tasks USING btree (migrated_from_reminder_id) WHERE (migrated_from_reminder_id IS NOT NULL)` |
| ux_conversation_tasks_creator_client_key | btree | created_by, client_task_id | sim | sim | `((client_task_id IS NOT NULL) AND (created_by IS NOT NULL))` | `CREATE UNIQUE INDEX ux_conversation_tasks_creator_client_key ON public.conversation_tasks USING btree (created_by, client_task_id) WHERE ((client_task_id IS NOT NULL) AND (created_by IS NOT NULL))` |


## Policies (RLS)

### `tasks_delete_own`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = current_profile_id()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `tasks_insert_own`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((created_by = current_profile_id()) AND ((contact_id IS NULL) OR is_contact_visible_to_user(contact_id, auth.uid())))` |

### `tasks_select_contact_visible`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IS NOT NULL) AND is_contact_visible_to_user(contact_id, auth.uid()))` |
| WITH CHECK |  |

### `tasks_select_own`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = current_profile_id()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `tasks_update_own`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = current_profile_id()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK | `((created_by = current_profile_id()) OR is_admin_or_supervisor(auth.uid()))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_prevent_conversation_task_field_forgery | BEFORE | UPDATE | ROW | enabled | public.prevent_conversation_task_field_forgery |
| trg_task_rearm_on_remind_change | BEFORE | UPDATE | ROW | enabled | public.conversation_task_rearm_on_remind_change |
| trg_task_set_assignee | BEFORE | INSERT | ROW | enabled | public.conversation_task_set_assignee |
| trg_task_state_change | BEFORE | UPDATE | ROW | enabled | public.conversation_task_state_trigger |
| update_conversation_tasks_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
