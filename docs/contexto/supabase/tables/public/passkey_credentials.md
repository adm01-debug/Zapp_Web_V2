# public.passkey_credentials

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
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `credential_id` | `text` | não |  |  |  |
| 4 | `public_key` | `text` | não |  |  |  |
| 5 | `counter` | `bigint` | não | `0` |  |  |
| 6 | `device_type` | `text` | sim |  |  |  |
| 7 | `backed_up` | `boolean` | sim | `false` |  |  |
| 8 | `transports` | `text[]` | sim |  |  |  |
| 9 | `friendly_name` | `text` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `last_used_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| passkey_credentials_credential_id_key | UNIQUE | `UNIQUE (credential_id)` |  |  | sim |
| passkey_credentials_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| passkey_credentials_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_passkey_credentials_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_passkey_credentials_user_id ON public.passkey_credentials USING btree (user_id)` |
| passkey_credentials_credential_id_key | btree | credential_id | sim | sim |  | `CREATE UNIQUE INDEX passkey_credentials_credential_id_key ON public.passkey_credentials USING btree (credential_id)` |
| passkey_credentials_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX passkey_credentials_pkey ON public.passkey_credentials USING btree (id)` |


## Policies (RLS)

### `Users can delete own passkeys`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can update own passkeys`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can view own passkeys`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
