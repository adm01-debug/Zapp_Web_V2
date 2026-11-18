# public.department_invitations

> Pending invitations to join a department (token-based)

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
| 2 | `department_id` | `uuid` | não |  |  |  |
| 3 | `code` | `text` | não |  |  |  |
| 4 | `email` | `text` | não | `''::text` |  |  |
| 5 | `role` | `text` | não | `'agent'::text` |  |  |
| 6 | `status` | `text` | não | `'pending'::text` |  |  |
| 7 | `expires_at` | `timestamp with time zone` | não |  |  |  |
| 8 | `created_by` | `uuid` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `used_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `used_by` | `uuid` | sim |  |  |  |
| 12 | `max_uses` | `integer` | não | `1` |  |  |
| 13 | `use_count` | `integer` | não | `0` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| department_invitations_code_key | UNIQUE | `UNIQUE (code)` |  |  | sim |
| department_invitations_department_id_fkey | FOREIGN KEY | `FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| department_invitations_expires_after_created | CHECK | `CHECK (expires_at IS NULL OR expires_at > created_at)` |  |  | sim |
| department_invitations_max_uses_positive | CHECK | `CHECK (max_uses >= 1)` |  |  | sim |
| department_invitations_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| department_invitations_status_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text])) NOT VALID` |  |  | não |
| department_invitations_use_count_nonneg | CHECK | `CHECK (use_count >= 0)` |  |  | sim |
| department_invitations_use_count_within_max | CHECK | `CHECK (use_count <= max_uses) NOT VALID` |  |  | não |
| department_invitations_used_by_fkey | FOREIGN KEY | `FOREIGN KEY (used_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| department_invitations_code_key | btree | code | sim | sim |  | `CREATE UNIQUE INDEX department_invitations_code_key ON public.department_invitations USING btree (code)` |
| department_invitations_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX department_invitations_pkey ON public.department_invitations USING btree (id)` |
| idx_department_invitations_code | btree | code | não | sim | `(status = 'pending'::text)` | `CREATE INDEX idx_department_invitations_code ON public.department_invitations USING btree (code) WHERE (status = 'pending'::text)` |
| idx_department_invitations_used_by | btree | used_by | não | sim |  | `CREATE INDEX idx_department_invitations_used_by ON public.department_invitations USING btree (used_by)` |
| idx_dept_invitations_dept_id | btree | department_id | não | sim |  | `CREATE INDEX idx_dept_invitations_dept_id ON public.department_invitations USING btree (department_id)` |


## Policies (RLS)

### `department_invitations_select_admin_supervisor`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `department_invitations_write_admin`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK | `is_admin(auth.uid())` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| department_invitations_code_format_insert_trg | BEFORE | INSERT | ROW | enabled | public.enforce_department_invitations_code_format_on_insert |


## Grants

_nenhum_
