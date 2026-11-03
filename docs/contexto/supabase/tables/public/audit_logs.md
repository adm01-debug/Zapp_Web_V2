# public.audit_logs

> Trilha de auditoria: login, mudancas de role/permissao, client_error do front (errorReporter) e acoes sensiveis. Leitura restrita a admin.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | full |
| vem de extensão | não |
| usada por views | public.searchbox_usage_daily |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | sim |  |  |  |
| 3 | `action` | `text` | não |  |  |  |
| 4 | `entity_type` | `text` | sim |  |  |  |
| 5 | `entity_id` | `uuid` | sim |  |  |  |
| 6 | `details` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 7 | `ip_address` | `text` | sim |  |  |  |
| 8 | `user_agent` | `text` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `dedupe_key` | `text` | sim |  |  | IA-WEBHOOK-001: chave idempotente do evento de webhook (ux_audit_logs_dedupe_key: único parcial). Replay da mesma entrega cai em 23505 e não gera novo registro. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| audit_logs_action_not_empty | CHECK | `CHECK (length(btrim(action)) > 0)` |  |  | sim |
| audit_logs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| audit_logs_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| audit_logs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX audit_logs_pkey ON public.audit_logs USING btree (id)` |
| idx_audit_logs_action_created_at | btree | action, created_at | não | sim |  | `CREATE INDEX idx_audit_logs_action_created_at ON public.audit_logs USING btree (action, created_at DESC)` |
| idx_audit_logs_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC)` |
| idx_audit_logs_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id)` |
| ux_audit_logs_dedupe_key | btree | dedupe_key | sim | sim | `(dedupe_key IS NOT NULL)` | `CREATE UNIQUE INDEX ux_audit_logs_dedupe_key ON public.audit_logs USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL)` |


## Policies (RLS)

### `Block authenticated deletes on audit_logs`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK |  |

### `Block authenticated updates on audit_logs`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK |  |

### `Block direct audit log inserts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `false` |

### `Only admins can view audit logs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(auth.uid(), 'admin'::app_role)` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
