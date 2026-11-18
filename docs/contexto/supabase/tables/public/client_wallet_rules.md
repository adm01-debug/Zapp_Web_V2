# public.client_wallet_rules

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `agent_id` | `uuid` | não |  |  |  |
| 4 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 5 | `priority` | `integer` | sim | `0` |  |  |
| 6 | `is_active` | `boolean` | sim | `true` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| client_wallet_rules_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| client_wallet_rules_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| client_wallet_rules_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| client_wallet_rules_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX client_wallet_rules_pkey ON public.client_wallet_rules USING btree (id)` |
| idx_client_wallet_rules_agent_id | btree | agent_id | não | sim |  | `CREATE INDEX idx_client_wallet_rules_agent_id ON public.client_wallet_rules USING btree (agent_id)` |
| idx_client_wallet_rules_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_client_wallet_rules_whatsapp_connection_id ON public.client_wallet_rules USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can manage wallet rules`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Wallet rules visible to admins only`

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
