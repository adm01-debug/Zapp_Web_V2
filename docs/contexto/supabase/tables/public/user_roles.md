# public.user_roles

> Atribuições de papéis de autorização por auth.users.id. Fonte de verdade para papéis; alterações são auditadas por trigger. Não confundir com profiles.role, que é um campo legado em cache.

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
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `role` | `app_role` | não | `'agent'::app_role` |  |  |
| 4 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| user_roles_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| user_roles_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| user_roles_user_id_role_key | UNIQUE | `UNIQUE (user_id, role)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_user_roles_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id)` |
| user_roles_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id)` |
| user_roles_user_id_role_key | btree | user_id, role | sim | sim |  | `CREATE UNIQUE INDEX user_roles_user_id_role_key ON public.user_roles USING btree (user_id, role)` |


## Policies (RLS)

### `Only admins can manage roles`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |
| WITH CHECK | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |

### `Users view own roles, admins view all`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((user_id = ( SELECT auth.uid() AS uid)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| audit_user_role_changes | AFTER | INSERT OR DELETE OR UPDATE | ROW | enabled | public.audit_role_changes |
| sync_profile_role | AFTER | INSERT OR DELETE OR UPDATE | ROW | enabled | public.sync_profile_role_from_user_roles |


## Grants

_nenhum_
