# public.chatbot_executions

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
| 2 | `flow_id` | `uuid` | não |  |  |  |
| 3 | `contact_id` | `uuid` | não |  |  |  |
| 4 | `current_node_id` | `text` | sim |  |  |  |
| 5 | `status` | `text` | não | `'running'::text` |  |  |
| 6 | `variables` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 7 | `started_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `error_message` | `text` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| chatbot_executions_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| chatbot_executions_flow_id_fkey | FOREIGN KEY | `FOREIGN KEY (flow_id) REFERENCES chatbot_flows(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| chatbot_executions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| chatbot_executions_status_check | CHECK | `CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'paused'::text, 'cancelled'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| chatbot_executions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX chatbot_executions_pkey ON public.chatbot_executions USING btree (id)` |
| idx_chatbot_executions_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_chatbot_executions_contact_id ON public.chatbot_executions USING btree (contact_id)` |
| idx_chatbot_executions_flow_id | btree | flow_id | não | sim |  | `CREATE INDEX idx_chatbot_executions_flow_id ON public.chatbot_executions USING btree (flow_id)` |
| idx_chatbot_executions_status | btree | status | não | sim |  | `CREATE INDEX idx_chatbot_executions_status ON public.chatbot_executions USING btree (status)` |


## Policies (RLS)

### `Admins can manage chatbot executions`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated can view chatbot executions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
