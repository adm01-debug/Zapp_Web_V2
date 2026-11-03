# public.department_invites

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `department_id` | `uuid` | não |  |  |  |
| 3 | `code` | `text` | não |  |  |  |
| 4 | `created_by` | `uuid` | sim |  |  |  |
| 5 | `expires_at` | `timestamp with time zone` | não |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| department_invites_code_key | UNIQUE | `UNIQUE (code)` |  |  | sim |
| department_invites_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| department_invites_department_id_fkey | FOREIGN KEY | `FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| department_invites_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| department_invites_code_key | btree | code | sim | sim |  | `CREATE UNIQUE INDEX department_invites_code_key ON public.department_invites USING btree (code)` |
| department_invites_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX department_invites_pkey ON public.department_invites USING btree (id)` |
| idx_dept_invites_code | btree | code | não | sim |  | `CREATE INDEX idx_dept_invites_code ON public.department_invites USING btree (code)` |
| idx_dept_invites_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_dept_invites_created_by ON public.department_invites USING btree (created_by)` |
| idx_dept_invites_dept_id | btree | department_id | não | sim |  | `CREATE INDEX idx_dept_invites_dept_id ON public.department_invites USING btree (department_id)` |


## Policies (RLS)

### `dept_invites_delete_admin`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK |  |

### `dept_invites_insert_admin`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin(auth.uid()) AND ((created_by IS NULL) OR (created_by IN ( SELECT p.id    FROM profiles p   WHERE (p.user_id = auth.uid())))))` |

### `dept_invites_select_authenticated`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
