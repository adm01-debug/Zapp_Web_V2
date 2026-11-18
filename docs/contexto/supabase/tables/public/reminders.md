# public.reminders

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
| 2 | `contact_id` | `uuid` | sim |  |  |  |
| 3 | `profile_id` | `uuid` | não |  |  |  |
| 4 | `title` | `text` | não |  |  |  |
| 5 | `description` | `text` | sim |  |  |  |
| 6 | `remind_at` | `timestamp with time zone` | não |  |  |  |
| 7 | `is_dismissed` | `boolean` | não | `false` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `notified_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `migrated_task_id` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| reminders_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| reminders_migrated_task_id_fkey | FOREIGN KEY | `FOREIGN KEY (migrated_task_id) REFERENCES conversation_tasks(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| reminders_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| reminders_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.conversation_tasks | conversation_tasks_migrated_from_reminder_id_fkey | migrated_from_reminder_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_reminders_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_reminders_contact_id ON public.reminders USING btree (contact_id)` |
| idx_reminders_due_pending | btree | remind_at | não | sim | `((is_dismissed = false) AND (notified_at IS NULL))` | `CREATE INDEX idx_reminders_due_pending ON public.reminders USING btree (remind_at) WHERE ((is_dismissed = false) AND (notified_at IS NULL))` |
| idx_reminders_migrated_task_id | btree | migrated_task_id | não | sim |  | `CREATE INDEX idx_reminders_migrated_task_id ON public.reminders USING btree (migrated_task_id)` |
| idx_reminders_profile | btree | profile_id | não | sim |  | `CREATE INDEX idx_reminders_profile ON public.reminders USING btree (profile_id)` |
| idx_reminders_remind_at | btree | remind_at | não | sim |  | `CREATE INDEX idx_reminders_remind_at ON public.reminders USING btree (remind_at)` |
| reminders_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX reminders_pkey ON public.reminders USING btree (id)` |


## Policies (RLS)

### `Users can manage own reminders`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(profile_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
