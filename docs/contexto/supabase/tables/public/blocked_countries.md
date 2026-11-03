# public.blocked_countries

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
| 2 | `country_code` | `text` | não |  |  |  |
| 3 | `country_name` | `text` | não |  |  |  |
| 4 | `reason` | `text` | sim |  |  |  |
| 5 | `blocked_by` | `uuid` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| blocked_countries_blocked_by_fkey | FOREIGN KEY | `FOREIGN KEY (blocked_by) REFERENCES auth.users(id)` | NO ACTION | NO ACTION | sim |
| blocked_countries_country_code_key | UNIQUE | `UNIQUE (country_code)` |  |  | sim |
| blocked_countries_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| blocked_countries_country_code_key | btree | country_code | sim | sim |  | `CREATE UNIQUE INDEX blocked_countries_country_code_key ON public.blocked_countries USING btree (country_code)` |
| blocked_countries_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX blocked_countries_pkey ON public.blocked_countries USING btree (id)` |
| idx_blocked_countries_blocked_by | btree | blocked_by | não | sim |  | `CREATE INDEX idx_blocked_countries_blocked_by ON public.blocked_countries USING btree (blocked_by)` |


## Policies (RLS)

### `Admins can delete blocked countries`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK |  |

### `Admins can insert blocked countries`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin(auth.uid())` |

### `Admins can view blocked countries`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
