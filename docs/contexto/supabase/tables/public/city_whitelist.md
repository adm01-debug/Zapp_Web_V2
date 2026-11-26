# public.city_whitelist

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
| 2 | `city_name` | `text` | não |  |  |  |
| 3 | `city_key` | `text` | sim | `normalize_city_name(city_name)` | s |  |
| 4 | `is_active` | `boolean` | não | `true` |  |  |
| 5 | `created_by` | `uuid` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| city_whitelist_city_key_key | UNIQUE | `UNIQUE (city_key)` |  |  | sim |
| city_whitelist_city_key_not_empty | CHECK | `CHECK (city_key IS NOT NULL)` |  |  | sim |
| city_whitelist_city_name_check | CHECK | `CHECK (btrim(city_name) <> ''::text AND char_length(city_name) <= 128)` |  |  | sim |
| city_whitelist_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| city_whitelist_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| city_whitelist_city_key_key | btree | city_key | sim | sim |  | `CREATE UNIQUE INDEX city_whitelist_city_key_key ON public.city_whitelist USING btree (city_key)` |
| city_whitelist_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX city_whitelist_pkey ON public.city_whitelist USING btree (id)` |


## Policies (RLS)

### `Admins can manage city whitelist`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |


## Triggers

_nenhum_


## Grants

_nenhum_
