# public.chatbot_flows

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `is_active` | `boolean` | sim | `false` |  |  |
| 5 | `trigger_type` | `text` | não | `'keyword'::text` |  |  |
| 6 | `trigger_value` | `text` | sim |  |  |  |
| 7 | `nodes` | `jsonb` | não | `'[]'::jsonb` |  |  |
| 8 | `edges` | `jsonb` | não | `'[]'::jsonb` |  |  |
| 9 | `variables` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 10 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 11 | `created_by` | `uuid` | sim |  |  |  |
| 12 | `execution_count` | `integer` | sim | `0` |  |  |
| 13 | `last_executed_at` | `timestamp with time zone` | sim |  |  |  |
| 14 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 15 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| chatbot_flows_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| chatbot_flows_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| chatbot_flows_trigger_type_check | CHECK | `CHECK (trigger_type = ANY (ARRAY['keyword'::text, 'first_message'::text, 'menu'::text, 'webhook'::text, 'schedule'::text, 'ai_l1'::text]))` |  |  | sim |
| chatbot_flows_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.chatbot_executions | chatbot_executions_flow_id_fkey | flow_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| chatbot_flows_ai_l1_one_active_idx | btree | whatsapp_connection_id | sim | sim | `((trigger_type = 'ai_l1'::text) AND (is_active IS TRUE) AND (whatsapp_connection_id IS NOT NULL))` | `CREATE UNIQUE INDEX chatbot_flows_ai_l1_one_active_idx ON public.chatbot_flows USING btree (whatsapp_connection_id) WHERE ((trigger_type = 'ai_l1'::text) AND (is_active IS TRUE) AND (whatsapp_connection_id IS NOT NULL))` |
| chatbot_flows_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX chatbot_flows_pkey ON public.chatbot_flows USING btree (id)` |
| idx_chatbot_flows_active | btree | is_active | não | sim |  | `CREATE INDEX idx_chatbot_flows_active ON public.chatbot_flows USING btree (is_active)` |
| idx_chatbot_flows_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_chatbot_flows_created_by ON public.chatbot_flows USING btree (created_by)` |
| idx_chatbot_flows_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_chatbot_flows_whatsapp_connection_id ON public.chatbot_flows USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can insert chatbot flows`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can manage chatbot flows`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Authenticated can view chatbot flows`

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
| update_chatbot_flows_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
