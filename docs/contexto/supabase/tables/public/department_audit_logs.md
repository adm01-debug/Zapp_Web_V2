# public.department_audit_logs

> Immutable audit trail for department membership and config changes

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
| 2 | `department_id` | `uuid` | não |  |  |  |
| 3 | `action` | `text` | não |  |  |  |
| 4 | `profile_id` | `uuid` | sim |  |  |  |
| 5 | `details` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `profile_name` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| department_audit_logs_action_check | CHECK | `CHECK (action = ANY (ARRAY['accept_invite'::text, 'create_invite'::text, 'join_department'::text, 'leave_department'::text, 'remove_member'::text, 'update_settings'::text, 'delete_department'::text, 'create_department'::text, 'update_role'::text, 'kick_member'::text, 'create_group'::text, 'delete_group'::text, 'whatsapp_updated'::text, 'access_requested'::text, 'invite_created'::text, 'invite_revoked'::text, 'invite_accepted'::text, 'member_added'::text, 'member_removed'::text, 'department_transferred'::text, 'add_member'::text, 'delete_invite'::text])) NOT VALID` |  |  | não |
| department_audit_logs_department_id_fkey | FOREIGN KEY | `FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| department_audit_logs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| department_audit_logs_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| department_audit_logs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX department_audit_logs_pkey ON public.department_audit_logs USING btree (id)` |
| idx_dept_audit_logs_dept_id | btree | department_id, created_at | não | sim |  | `CREATE INDEX idx_dept_audit_logs_dept_id ON public.department_audit_logs USING btree (department_id, created_at DESC)` |
| idx_dept_audit_logs_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_dept_audit_logs_profile_id ON public.department_audit_logs USING btree (profile_id)` |


## Policies (RLS)

### `dept_audit_select_own_dept`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM profiles p   WHERE ((p.id = current_profile_id()) AND (p.department_id = department_audit_logs.department_id) AND (p.role = ANY (ARRAY['admin'::text, 'supervisor'::text])))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| department_audit_logs_fill_profile_name_trig | BEFORE | INSERT | ROW | enabled | public.department_audit_logs_fill_profile_name |


## Grants

_nenhum_
