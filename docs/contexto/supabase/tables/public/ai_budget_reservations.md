# public.ai_budget_reservations

> [RLS-sem-policy: intencional] Reservas de budget de IA gerenciadas exclusivamente pelo ai-jobs-worker (service_role). Nenhum acesso direto do front.

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
| 3 | `user_id` | `uuid` | sim |  |  |  |
| 4 | `function_name` | `text` | não |  |  |  |
| 5 | `reserved_tokens` | `integer` | não |  |  |  |
| 6 | `actual_tokens` | `integer` | sim |  |  |  |
| 7 | `status` | `text` | não | `'reserved'::text` |  |  |
| 8 | `expires_at` | `timestamp with time zone` | não |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| ai_budget_reservations_idempotency_key_key | UNIQUE | `UNIQUE (idempotency_key)` |  |  | sim |
| ai_budget_reservations_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| ai_budget_reservations_status_check | CHECK | `CHECK (status = ANY (ARRAY['reserved'::text, 'settled'::text, 'released'::text, 'expired'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| ai_budget_reservations_idempotency_key_key | btree | idempotency_key | sim | sim |  | `CREATE UNIQUE INDEX ai_budget_reservations_idempotency_key_key ON public.ai_budget_reservations USING btree (idempotency_key)` |
| ai_budget_reservations_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX ai_budget_reservations_pkey ON public.ai_budget_reservations USING btree (id)` |
| idx_ai_budget_reservations_reserved_expiry | btree | status, expires_at | não | sim | `(status = 'reserved'::text)` | `CREATE INDEX idx_ai_budget_reservations_reserved_expiry ON public.ai_budget_reservations USING btree (status, expires_at) WHERE (status = 'reserved'::text)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
