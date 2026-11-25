# public.chatbot_executions

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.chatbot_executions (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 flow_id uuid NOT NULL
3 contact_id uuid NOT NULL
4 current_node_id text NULLABLE
5 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 variables jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 started_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 completed_at timestamp with time zone NULLABLE
9 error_message text NULLABLE
10 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
chatbot_executions_status_check: CHECK (status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'paused'::text, 'cancelled'::text]))
chatbot_executions_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
chatbot_executions_flow_id_fkey: FOREIGN KEY (flow_id) REFERENCES chatbot_flows(id) ON DELETE CASCADE
chatbot_executions_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage chatbot executions" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated can view chatbot executions" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Authenticated can view chatbot executions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT p.id            FROM profiles p           WHERE (p.user_id = ( SELECT auth.uid() AS uid)))))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
