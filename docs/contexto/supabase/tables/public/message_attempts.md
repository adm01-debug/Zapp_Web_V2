# public.message_attempts

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
| 2 | `message_id` | `uuid` | não |  |  |  |
| 3 | `attempt_no` | `integer` | não |  |  |  |
| 4 | `outcome` | `text` | não |  |  |  |
| 5 | `error_code` | `text` | sim |  |  |  |
| 6 | `error_message` | `text` | sim |  |  |  |
| 7 | `provider_status` | `integer` | sim |  |  |  |
| 8 | `provider_response` | `jsonb` | sim |  |  |  |
| 9 | `duration_ms` | `integer` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| message_attempts_error_message_len_check | CHECK | `CHECK (error_message IS NULL OR length(error_message) <= 500)` |  |  | sim |
| message_attempts_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| message_attempts_outcome_check | CHECK | `CHECK (outcome = ANY (ARRAY['claimed'::text, 'sent'::text, 'failed_retryable'::text, 'failed_final'::text]))` |  |  | sim |
| message_attempts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| message_attempts_unique | UNIQUE | `UNIQUE (message_id, attempt_no, outcome)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| message_attempts_message_created_idx | btree | message_id, created_at | não | sim |  | `CREATE INDEX message_attempts_message_created_idx ON public.message_attempts USING btree (message_id, created_at)` |
| message_attempts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX message_attempts_pkey ON public.message_attempts USING btree (id)` |
| message_attempts_unique | btree | message_id, attempt_no, outcome | sim | sim |  | `CREATE UNIQUE INDEX message_attempts_unique ON public.message_attempts USING btree (message_id, attempt_no, outcome)` |


## Policies (RLS)

### `message_attempts_select_admin`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
