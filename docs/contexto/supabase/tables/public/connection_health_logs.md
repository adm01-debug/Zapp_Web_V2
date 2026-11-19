# public.connection_health_logs

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `connection_id` | `uuid` | não |  |  |  |
| 3 | `instance_id` | `text` | não |  |  |  |
| 4 | `status` | `text` | não | `'unknown'::text` |  |  |
| 5 | `response_time_ms` | `integer` | sim |  |  |  |
| 6 | `error_message` | `text` | sim |  |  |  |
| 7 | `checked_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| connection_health_logs_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| connection_health_logs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| connection_health_logs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX connection_health_logs_pkey ON public.connection_health_logs USING btree (id)` |
| idx_connection_health_logs_connection_id | btree | connection_id | não | sim |  | `CREATE INDEX idx_connection_health_logs_connection_id ON public.connection_health_logs USING btree (connection_id)` |
| idx_health_logs_checked_at | btree | checked_at | não | sim |  | `CREATE INDEX idx_health_logs_checked_at ON public.connection_health_logs USING btree (checked_at DESC)` |


## Policies (RLS)

### `Admins can delete health logs`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK |  |

### `Admins can insert health logs`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin(auth.uid())` |

### `Admins can view health logs`

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
