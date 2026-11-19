# public.app_settings

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
| 1 | `key` | `text` | não |  |  |  |
| 2 | `value` | `text` | não |  |  |  |
| 3 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| app_settings_pkey | PRIMARY KEY | `PRIMARY KEY (key)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| app_settings_pkey | btree | key | sim | sim |  | `CREATE UNIQUE INDEX app_settings_pkey ON public.app_settings USING btree (key)` |


## Policies (RLS)

### `app_settings_admin_all`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM user_roles ur   WHERE ((ur.user_id = ( SELECT auth.uid() AS uid)) AND (ur.role = 'admin'::app_role))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
