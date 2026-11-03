# public.voice_command_logs

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
| 3 | `transcript` | `text` | não |  |  |  |
| 4 | `action` | `text` | não |  |  |  |
| 5 | `response` | `text` | sim |  |  |  |
| 6 | `data` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 7 | `duration_ms` | `integer` | sim |  |  |  |
| 8 | `success` | `boolean` | sim | `true` |  |  |
| 9 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| voice_command_logs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| voice_command_logs_response_length_check | CHECK | `CHECK (response IS NULL OR char_length(response) <= 2000) NOT VALID` |  |  | não |
| voice_command_logs_transcript_length_check | CHECK | `CHECK (char_length(transcript) <= 2000) NOT VALID` |  |  | não |
| voice_command_logs_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_voice_command_logs_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_voice_command_logs_created_at ON public.voice_command_logs USING btree (created_at DESC)` |
| idx_voice_command_logs_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_voice_command_logs_user_id ON public.voice_command_logs USING btree (user_id)` |
| voice_command_logs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX voice_command_logs_pkey ON public.voice_command_logs USING btree (id)` |


## Policies (RLS)

### `Users can delete own voice logs`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(auth.uid() = user_id)` |
| WITH CHECK |  |

### `Users can insert own voice logs`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(auth.uid() = user_id)` |

### `Users can read own voice logs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(auth.uid() = user_id)` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
