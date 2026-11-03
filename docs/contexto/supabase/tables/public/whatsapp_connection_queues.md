# public.whatsapp_connection_queues

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `whatsapp_connection_id` | `uuid` | não |  |  |  |
| 3 | `queue_id` | `uuid` | não |  |  |  |
| 4 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| whatsapp_connection_queues_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| whatsapp_connection_queues_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| whatsapp_connection_queues_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| whatsapp_connection_queues_whatsapp_connection_id_queue_id_key | UNIQUE | `UNIQUE (whatsapp_connection_id, queue_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_whatsapp_connection_queues_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_whatsapp_connection_queues_queue_id ON public.whatsapp_connection_queues USING btree (queue_id)` |
| idx_whatsapp_connection_queues_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_whatsapp_connection_queues_whatsapp_connection_id ON public.whatsapp_connection_queues USING btree (whatsapp_connection_id)` |
| whatsapp_connection_queues_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_connection_queues_pkey ON public.whatsapp_connection_queues USING btree (id)` |
| whatsapp_connection_queues_whatsapp_connection_id_queue_id_key | btree | whatsapp_connection_id, queue_id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_connection_queues_whatsapp_connection_id_queue_id_key ON public.whatsapp_connection_queues USING btree (whatsapp_connection_id, queue_id)` |


## Policies (RLS)

### `Admins can manage connection queues`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK |  |

### `Authenticated can view connection queues`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| audit_connection_queues_config | AFTER | INSERT OR DELETE OR UPDATE | ROW | enabled | public.audit_operational_config |


## Grants

_nenhum_
