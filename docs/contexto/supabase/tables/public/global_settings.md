# public.global_settings

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
| 2 | `key` | `text` | não |  |  |  |
| 3 | `value` | `text` | sim |  |  |  |
| 4 | `description` | `text` | sim |  |  |  |
| 5 | `updated_by` | `uuid` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| global_settings_inbox_silence_minutes_range | CHECK | `CHECK (key <> 'inbox_silence_minutes'::text OR value IS NOT NULL AND value ~ '^[0-9]{1,4}$'::text AND value::integer >= 1 AND value::integer <= 1440)` |  |  | sim |
| global_settings_key_key | UNIQUE | `UNIQUE (key)` |  |  | sim |
| global_settings_no_plaintext_api_token | CHECK | `CHECK (key <> 'api_token'::text)` |  |  | sim |
| global_settings_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| global_settings_key_key | btree | key | sim | sim |  | `CREATE UNIQUE INDEX global_settings_key_key ON public.global_settings USING btree (key)` |
| global_settings_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX global_settings_pkey ON public.global_settings USING btree (id)` |


## Policies (RLS)

### `Admins can manage global settings`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK | `is_admin(auth.uid())` |

### `Admins can view global settings`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin(auth.uid()) OR (is_admin_or_supervisor(auth.uid()) AND (key !~ '(_api_key\|_secret\|_token)$'::text)))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trigger_global_settings_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_global_settings_updated_at |


## Grants

_nenhum_
