# public.sla_rules

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.sla_rules (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 first_response_minutes integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 resolution_minutes integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 priority integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 contact_id uuid NULLABLE
7 company text NULLABLE
8 job_title text NULLABLE
9 contact_type text NULLABLE
10 queue_id uuid NULLABLE
11 agent_id uuid NULLABLE
12 is_active boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
13 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
14 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
15 metadata jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
sla_rules_agent_id_fkey: FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE
sla_rules_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
sla_rules_queue_id_fkey: FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE
sla_rules_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins and supervisors can delete SLA rules" [command=DELETE; roles=authenticated; PERMISSIVE]
"Admins and supervisors can insert SLA rules" [command=INSERT; roles=authenticated; PERMISSIVE]
"Admins and supervisors can update SLA rules" [command=UPDATE; roles=authenticated; PERMISSIVE]
"SLA rules visible to admins only" [command=SELECT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `first_response_minutes` | `integer` | não | `5` |  |  |
| 4 | `resolution_minutes` | `integer` | não | `60` |  |  |
| 5 | `priority` | `integer` | não | `0` |  |  |
| 6 | `contact_id` | `uuid` | sim |  |  |  |
| 7 | `company` | `text` | sim |  |  |  |
| 8 | `job_title` | `text` | sim |  |  |  |
| 9 | `contact_type` | `text` | sim |  |  |  |
| 10 | `queue_id` | `uuid` | sim |  |  |  |
| 11 | `agent_id` | `uuid` | sim |  |  |  |
| 12 | `is_active` | `boolean` | não | `true` |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 15 | `metadata` | `jsonb` | sim | `'{}'::jsonb` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| sla_rules_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| sla_rules_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| sla_rules_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| sla_rules_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_sla_rules_active | btree | is_active | não | sim | `(is_active = true)` | `CREATE INDEX idx_sla_rules_active ON public.sla_rules USING btree (is_active) WHERE (is_active = true)` |
| idx_sla_rules_active_priority | btree | is_active, priority | não | sim |  | `CREATE INDEX idx_sla_rules_active_priority ON public.sla_rules USING btree (is_active, priority DESC)` |
| idx_sla_rules_agent_id | btree | agent_id | não | sim | `(agent_id IS NOT NULL)` | `CREATE INDEX idx_sla_rules_agent_id ON public.sla_rules USING btree (agent_id) WHERE (agent_id IS NOT NULL)` |
| idx_sla_rules_company | btree | company | não | sim | `(company IS NOT NULL)` | `CREATE INDEX idx_sla_rules_company ON public.sla_rules USING btree (company) WHERE (company IS NOT NULL)` |
| idx_sla_rules_contact_id | btree | contact_id | não | sim | `(contact_id IS NOT NULL)` | `CREATE INDEX idx_sla_rules_contact_id ON public.sla_rules USING btree (contact_id) WHERE (contact_id IS NOT NULL)` |
| idx_sla_rules_queue_id | btree | queue_id | não | sim | `(queue_id IS NOT NULL)` | `CREATE INDEX idx_sla_rules_queue_id ON public.sla_rules USING btree (queue_id) WHERE (queue_id IS NOT NULL)` |
| sla_rules_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX sla_rules_pkey ON public.sla_rules USING btree (id)` |


## Policies (RLS)

### `Admins and supervisors can delete SLA rules`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Admins and supervisors can insert SLA rules`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Admins and supervisors can update SLA rules`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `SLA rules visible to admins only`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_sla_rules_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
