# public.user_devices

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `device_fingerprint` | `text` | não |  |  |  |
| 4 | `device_name` | `text` | sim |  |  |  |
| 5 | `browser` | `text` | sim |  |  |  |
| 6 | `os` | `text` | sim |  |  |  |
| 7 | `ip_address` | `text` | sim |  |  |  |
| 8 | `city` | `text` | sim |  |  |  |
| 9 | `country` | `text` | sim |  |  |  |
| 10 | `is_trusted` | `boolean` | sim | `false` |  |  |
| 11 | `first_seen_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `last_seen_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| user_devices_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| user_devices_user_id_device_fingerprint_key | UNIQUE | `UNIQUE (user_id, device_fingerprint)` |  |  | sim |
| user_devices_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.user_sessions | user_sessions_device_id_fkey | device_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_user_devices_fingerprint | btree | device_fingerprint | não | sim |  | `CREATE INDEX idx_user_devices_fingerprint ON public.user_devices USING btree (device_fingerprint)` |
| user_devices_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX user_devices_pkey ON public.user_devices USING btree (id)` |
| user_devices_user_id_device_fingerprint_key | btree | user_id, device_fingerprint | sim | sim |  | `CREATE UNIQUE INDEX user_devices_user_id_device_fingerprint_key ON public.user_devices USING btree (user_id, device_fingerprint)` |


## Policies (RLS)

### `Admins can view all user devices`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Users can delete their own devices`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can insert their own devices`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = auth.uid())` |

### `Users can update their own devices`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can view their own devices`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| on_device_update_last_seen | BEFORE | UPDATE | ROW | enabled | public.update_device_last_seen |


## Grants

_nenhum_
