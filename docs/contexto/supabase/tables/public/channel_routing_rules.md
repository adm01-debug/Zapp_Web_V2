# public.channel_routing_rules

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
| 2 | `channel_type` | `channel_type` | não |  |  |  |
| 3 | `channel_connection_id` | `uuid` | sim |  |  |  |
| 4 | `queue_id` | `uuid` | sim |  |  |  |
| 5 | `priority` | `integer` | sim | `0` |  |  |
| 6 | `conditions` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 7 | `is_active` | `boolean` | sim | `true` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| channel_routing_rules_channel_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id)` | NO ACTION | NO ACTION | sim |
| channel_routing_rules_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| channel_routing_rules_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| channel_routing_rules_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX channel_routing_rules_pkey ON public.channel_routing_rules USING btree (id)` |
| idx_channel_routing_rules_channel_connection_id | btree | channel_connection_id | não | sim |  | `CREATE INDEX idx_channel_routing_rules_channel_connection_id ON public.channel_routing_rules USING btree (channel_connection_id)` |
| idx_channel_routing_rules_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_channel_routing_rules_queue_id ON public.channel_routing_rules USING btree (queue_id)` |


## Policies (RLS)

### `Admins can manage routing rules`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated can view routing rules`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
