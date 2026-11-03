# public.ai_jobs

> [RLS-sem-policy: intencional] Fila de jobs de IA. Leitura/escrita pelo ai-jobs-worker (service_role). Front acessa status via RPC ai_job_status (security-definer).

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 0 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `idempotency_key` | `text` | não |  |  |  |
| 3 | `kind` | `text` | não |  |  |  |
| 4 | `function_name` | `text` | não |  |  |  |
| 5 | `user_id` | `uuid` | sim |  |  |  |
| 6 | `payload` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 7 | `priority` | `integer` | não | `100` |  |  |
| 8 | `status` | `text` | não | `'queued'::text` |  |  |
| 9 | `attempt_count` | `integer` | não | `0` |  |  |
| 10 | `max_attempts` | `integer` | não | `8` |  |  |
| 11 | `available_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `expires_at` | `timestamp with time zone` | sim |  |  |  |
| 13 | `locked_at` | `timestamp with time zone` | sim |  |  |  |
| 14 | `locked_by` | `text` | sim |  |  |  |
| 15 | `lease_token` | `uuid` | sim |  |  |  |
| 16 | `lease_expires_at` | `timestamp with time zone` | sim |  |  |  |
| 17 | `heartbeat_at` | `timestamp with time zone` | sim |  |  |  |
| 18 | `result` | `jsonb` | sim |  |  |  |
| 19 | `last_error_code` | `text` | sim |  |  |  |
| 20 | `started_at` | `timestamp with time zone` | sim |  |  |  |
| 21 | `finished_at` | `timestamp with time zone` | sim |  |  |  |
| 22 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 23 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 24 | `effect_started_at` | `timestamp with time zone` | sim |  |  | IA-202/R2-API-026: instante em que a tentativa corrente marcou o início do efeito externo (mark_ai_job_effect_started). Limpo a cada claim; preservado em outcome_unknown para reconciliação. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| ai_jobs_attempt_count_nonneg | CHECK | `CHECK (attempt_count >= 0)` |  |  | sim |
| ai_jobs_idempotency_key_key | UNIQUE | `UNIQUE (idempotency_key)` |  |  | sim |
| ai_jobs_max_attempts_range | CHECK | `CHECK (max_attempts >= 1 AND max_attempts <= 50)` |  |  | sim |
| ai_jobs_payload_object | CHECK | `CHECK (jsonb_typeof(payload) = 'object'::text)` |  |  | sim |
| ai_jobs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| ai_jobs_priority_range | CHECK | `CHECK (priority >= 0 AND priority <= 1000)` |  |  | sim |
| ai_jobs_status_check | CHECK | `CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'partial'::text, 'succeeded'::text, 'failed'::text, 'cancelled'::text, 'outcome_unknown'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| ai_jobs_idempotency_key_key | btree | idempotency_key | sim | sim |  | `CREATE UNIQUE INDEX ai_jobs_idempotency_key_key ON public.ai_jobs USING btree (idempotency_key)` |
| ai_jobs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX ai_jobs_pkey ON public.ai_jobs USING btree (id)` |
| idx_ai_jobs_queued_priority | btree | priority, available_at | não | sim | `(status = 'queued'::text)` | `CREATE INDEX idx_ai_jobs_queued_priority ON public.ai_jobs USING btree (priority, available_at) WHERE (status = 'queued'::text)` |
| idx_ai_jobs_running_lease | btree | lease_expires_at | não | sim | `(status = 'running'::text)` | `CREATE INDEX idx_ai_jobs_running_lease ON public.ai_jobs USING btree (lease_expires_at) WHERE (status = 'running'::text)` |
| idx_ai_jobs_status_expires | btree | status, expires_at | não | sim | `(expires_at IS NOT NULL)` | `CREATE INDEX idx_ai_jobs_status_expires ON public.ai_jobs USING btree (status, expires_at) WHERE (expires_at IS NOT NULL)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
