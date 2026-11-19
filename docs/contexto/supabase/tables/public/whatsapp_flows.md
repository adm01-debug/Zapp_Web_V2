# public.whatsapp_flows

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
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `flow_json` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 5 | `screens` | `jsonb` | não | `'[]'::jsonb` |  |  |
| 6 | `status` | `text` | sim | `'draft'::text` |  |  |
| 7 | `whatsapp_flow_id` | `text` | sim |  |  |  |
| 8 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 9 | `created_by` | `uuid` | sim |  |  |  |
| 10 | `published_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| whatsapp_flows_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| whatsapp_flows_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| whatsapp_flows_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_whatsapp_flows_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_whatsapp_flows_created_by ON public.whatsapp_flows USING btree (created_by)` |
| idx_whatsapp_flows_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_whatsapp_flows_whatsapp_connection_id ON public.whatsapp_flows USING btree (whatsapp_connection_id)` |
| whatsapp_flows_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_flows_pkey ON public.whatsapp_flows USING btree (id)` |


## Policies (RLS)

### `Admins can manage whatsapp flows`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated can view whatsapp flows`

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
| update_whatsapp_flows_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
