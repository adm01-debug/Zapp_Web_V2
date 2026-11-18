# public.gmail_accounts

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |
| usada por views | public.gmail_accounts_safe |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `email_address` | `text` | não |  |  |  |
| 4 | `is_active` | `boolean` | não | `true` |  |  |
| 5 | `sync_status` | `text` | não | `'pending'::text` |  |  |
| 6 | `last_sync_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `last_error` | `text` | sim |  |  |  |
| 10 | `token_expires_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `access_token_encrypted` | `bytea` | sim |  |  |  |
| 14 | `refresh_token_encrypted` | `bytea` | sim |  |  |  |
| 15 | `history_id` | `text` | sim |  |  |  |
| 16 | `watch_expiration` | `timestamp with time zone` | sim |  |  |  |
| 17 | `error_count` | `integer` | não | `0` |  | Falhas seguidas de sincronizacao (espera crescente no gmail-cron-sync) |
| 18 | `next_attempt_at` | `timestamp with time zone` | sim |  |  | Quando a conta pode ser tentada de novo pelo cron (NULL = ja pode) |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| gmail_accounts_email_address_key | UNIQUE | `UNIQUE (email_address)` |  |  | sim |
| gmail_accounts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| gmail_accounts_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT` | RESTRICT | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.email_labels | email_labels_gmail_account_id_fkey | gmail_account_id | CASCADE |
| public.email_messages | email_messages_gmail_account_id_fkey | gmail_account_id | CASCADE |
| public.email_threads | email_threads_gmail_account_id_fkey | gmail_account_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| gmail_accounts_email_address_key | btree | email_address | sim | sim |  | `CREATE UNIQUE INDEX gmail_accounts_email_address_key ON public.gmail_accounts USING btree (email_address)` |
| gmail_accounts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX gmail_accounts_pkey ON public.gmail_accounts USING btree (id)` |
| idx_gmail_accounts_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_gmail_accounts_user_id ON public.gmail_accounts USING btree (user_id)` |


## Policies (RLS)

### `Block authenticated gmail deletes`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | RESTRICTIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK |  |

### `Block authenticated gmail inserts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | RESTRICTIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `false` |

### `Block authenticated gmail updates`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | RESTRICTIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK |  |

### `Users can view their own gmail accounts`

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
| update_gmail_accounts_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
