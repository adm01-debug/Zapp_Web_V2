# public.conversation_sla

> Instancia de SLA por contato: primeiro contato, primeira resposta (mark_first_response), resolucao e flags de violacao, ligada a sla_configurations.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | sim |  |  |  |
| 3 | `sla_configuration_id` | `uuid` | sim |  |  |  |
| 4 | `first_message_at` | `timestamp with time zone` | não | `now()` |  |  |
| 5 | `first_response_at` | `timestamp with time zone` | sim |  |  |  |
| 6 | `resolved_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `first_response_breached` | `boolean` | sim | `false` |  |  |
| 8 | `resolution_breached` | `boolean` | sim | `false` |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| conversation_sla_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| conversation_sla_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| conversation_sla_sla_configuration_id_fkey | FOREIGN KEY | `FOREIGN KEY (sla_configuration_id) REFERENCES sla_configurations(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| conversation_sla_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX conversation_sla_pkey ON public.conversation_sla USING btree (id)` |
| idx_conversation_sla_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_conversation_sla_contact_id ON public.conversation_sla USING btree (contact_id)` |
| idx_conversation_sla_sla_configuration_id | btree | sla_configuration_id | não | sim |  | `CREATE INDEX idx_conversation_sla_sla_configuration_id ON public.conversation_sla USING btree (sla_configuration_id)` |
| idx_sla_first_message_at | btree | first_message_at | não | sim |  | `CREATE INDEX idx_sla_first_message_at ON public.conversation_sla USING btree (first_message_at DESC)` |
| idx_sla_first_msg_contact | btree | first_message_at, contact_id | não | sim |  | `CREATE INDEX idx_sla_first_msg_contact ON public.conversation_sla USING btree (first_message_at, contact_id)` |
| ux_conversation_sla_open_per_contact | btree | contact_id | sim | sim | `(first_response_at IS NULL)` | `CREATE UNIQUE INDEX ux_conversation_sla_open_per_contact ON public.conversation_sla USING btree (contact_id) WHERE (first_response_at IS NULL)` |


## Policies (RLS)

### `Admins can insert SLA`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can update SLA`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `conversation_sla_select_policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR (contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_conversation_sla_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
