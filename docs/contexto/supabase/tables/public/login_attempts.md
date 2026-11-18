# public.login_attempts

> Contador de falhas de login por e-mail com bloqueio exponencial (record_failed_login / is_account_locked / clear_login_attempts). Acesso apenas via SECURITY DEFINER e edges service_role.

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


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `email` | `text` | não |  |  |  |
| 3 | `ip_address` | `text` | sim |  |  |  |
| 4 | `user_agent` | `text` | sim |  |  |  |
| 5 | `attempt_count` | `integer` | não | `1` |  |  |
| 6 | `last_attempt_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `locked_until` | `timestamp with time zone` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| login_attempts_attempt_count_max | CHECK | `CHECK (attempt_count <= 10000)` |  |  | sim |
| login_attempts_email_key | UNIQUE | `UNIQUE (email)` |  |  | sim |
| login_attempts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_login_attempts_locked | btree | locked_until | não | sim | `(locked_until IS NOT NULL)` | `CREATE INDEX idx_login_attempts_locked ON public.login_attempts USING btree (locked_until) WHERE (locked_until IS NOT NULL)` |
| login_attempts_email_key | btree | email | sim | sim |  | `CREATE UNIQUE INDEX login_attempts_email_key ON public.login_attempts USING btree (email)` |
| login_attempts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX login_attempts_pkey ON public.login_attempts USING btree (id)` |


## Policies (RLS)

### `Admins and supervisors can view login attempts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Block authenticated inserts on login_attempts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `false` |

### `Block authenticated updates on login_attempts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK |  |

### `Only admins can delete login attempts`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
