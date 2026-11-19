# public.followup_executions

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
| 2 | `sequence_id` | `uuid` | não |  |  |  |
| 3 | `contact_id` | `uuid` | não |  |  |  |
| 4 | `current_step` | `integer` | sim | `0` |  |  |
| 5 | `status` | `text` | não | `'pending'::text` |  |  |
| 6 | `started_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 7 | `next_step_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| followup_executions_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id)` | NO ACTION | NO ACTION | sim |
| followup_executions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| followup_executions_sequence_id_fkey | FOREIGN KEY | `FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| followup_executions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX followup_executions_pkey ON public.followup_executions USING btree (id)` |
| idx_followup_executions_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_followup_executions_contact_id ON public.followup_executions USING btree (contact_id)` |
| idx_followup_executions_sequence_id | btree | sequence_id | não | sim |  | `CREATE INDEX idx_followup_executions_sequence_id ON public.followup_executions USING btree (sequence_id)` |


## Policies (RLS)

### `Admins can manage followup executions`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated can view followup executions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
