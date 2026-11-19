# public.ai_usage_logs

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
| 2 | `user_id` | `uuid` | sim |  |  |  |
| 3 | `profile_id` | `uuid` | sim |  |  |  |
| 4 | `function_name` | `text` | não |  |  |  |
| 5 | `model` | `text` | sim |  |  |  |
| 6 | `input_tokens` | `integer` | sim | `0` |  |  |
| 7 | `output_tokens` | `integer` | sim | `0` |  |  |
| 8 | `total_tokens` | `integer` | sim | `(input_tokens + output_tokens)` | s |  |
| 9 | `duration_ms` | `integer` | sim |  |  |  |
| 10 | `status` | `text` | não | `'success'::text` |  |  |
| 11 | `error_message` | `text` | sim |  |  |  |
| 12 | `metadata` | `jsonb` | sim |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `request_id` | `uuid` | sim |  |  | IA-051: uuid opaco da operação de IA (cliente/worker). Nunca dado pessoal. |
| 15 | `job_id` | `uuid` | sim |  |  | IA-051: job da fila (ai_jobs.id) que originou a execução, quando houver. |
| 16 | `attempt` | `smallint` | sim |  |  | IA-051: tentativa do job (ai_jobs.attempt_count) no momento da execução. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| ai_usage_logs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| ai_usage_logs_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| ai_usage_logs_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| ai_usage_logs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX ai_usage_logs_pkey ON public.ai_usage_logs USING btree (id)` |
| idx_ai_usage_logs_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs USING btree (created_at DESC)` |
| idx_ai_usage_logs_function_name | btree | function_name | não | sim |  | `CREATE INDEX idx_ai_usage_logs_function_name ON public.ai_usage_logs USING btree (function_name)` |
| idx_ai_usage_logs_job_id | btree | job_id | não | sim | `(job_id IS NOT NULL)` | `CREATE INDEX idx_ai_usage_logs_job_id ON public.ai_usage_logs USING btree (job_id) WHERE (job_id IS NOT NULL)` |
| idx_ai_usage_logs_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_ai_usage_logs_profile_id ON public.ai_usage_logs USING btree (profile_id)` |
| idx_ai_usage_logs_request_id | btree | request_id | não | sim |  | `CREATE INDEX idx_ai_usage_logs_request_id ON public.ai_usage_logs USING btree (request_id)` |
| idx_ai_usage_logs_status | btree | status | não | sim |  | `CREATE INDEX idx_ai_usage_logs_status ON public.ai_usage_logs USING btree (status)` |
| idx_ai_usage_logs_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_ai_usage_logs_user_id ON public.ai_usage_logs USING btree (user_id)` |


## Policies (RLS)

### `Admins can view all AI usage logs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Service role can insert AI usage logs`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | service_role |
| USING |  |
| WITH CHECK | `true` |

### `Users can view own AI usage logs`

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
