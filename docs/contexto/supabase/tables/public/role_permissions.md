# public.role_permissions

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
| 2 | `role` | `app_role` | não |  |  |  |
| 3 | `permission_id` | `uuid` | não |  |  |  |
| 4 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| role_permissions_permission_id_fkey | FOREIGN KEY | `FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| role_permissions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| role_permissions_role_permission_id_key | UNIQUE | `UNIQUE (role, permission_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_role_permissions_permission_id | btree | permission_id | não | sim |  | `CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions USING btree (permission_id)` |
| role_permissions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (id)` |
| role_permissions_role_permission_id_key | btree | role, permission_id | sim | sim |  | `CREATE UNIQUE INDEX role_permissions_role_permission_id_key ON public.role_permissions USING btree (role, permission_id)` |


## Policies (RLS)

### `Admin supervisor can view role permissions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can manage role permissions`

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
| audit_role_permissions_changes | AFTER | INSERT OR DELETE | ROW | enabled | public.audit_role_permissions_changes |


## Grants

_nenhum_
