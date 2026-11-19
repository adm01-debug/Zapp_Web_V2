# public.reconnection_logs

> Historico das tentativas de reconexao por conexao. Escrito pelo sistema (service_role); retencao de 30 dias.

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
| 2 | `connection_id` | `uuid` | não |  |  |  |
| 3 | `attempt` | `integer` | não |  |  |  |
| 4 | `result` | `text` | não |  |  |  |
| 5 | `reason` | `text` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| reconnection_logs_attempt_check | CHECK | `CHECK (attempt >= 1)` |  |  | sim |
| reconnection_logs_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| reconnection_logs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| reconnection_logs_reason_check | CHECK | `CHECK (reason IS NULL OR char_length(reason) <= 200)` |  |  | sim |
| reconnection_logs_result_check | CHECK | `CHECK (result = ANY (ARRAY['success'::text, 'failure'::text, 'skipped'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| reconnection_logs_connection_created_idx | btree | connection_id, created_at | não | sim |  | `CREATE INDEX reconnection_logs_connection_created_idx ON public.reconnection_logs USING btree (connection_id, created_at DESC)` |
| reconnection_logs_created_at_idx | btree | created_at | não | sim |  | `CREATE INDEX reconnection_logs_created_at_idx ON public.reconnection_logs USING btree (created_at)` |
| reconnection_logs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX reconnection_logs_pkey ON public.reconnection_logs USING btree (id)` |


## Policies (RLS)

### `Staff can view reconnection logs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
