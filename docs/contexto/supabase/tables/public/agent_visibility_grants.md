# public.agent_visibility_grants

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.agent_visibility_grants (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 agent_id uuid NOT NULL
3 can_see_agent_id uuid NOT NULL
4 granted_by uuid NULLABLE
5 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
agent_visibility_grants_no_self_grant: CHECK (agent_id <> can_see_agent_id)
agent_visibility_grants_agent_id_fkey: FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE
agent_visibility_grants_can_see_agent_id_fkey: FOREIGN KEY (can_see_agent_id) REFERENCES profiles(id) ON DELETE CASCADE
agent_visibility_grants_granted_by_fkey: FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL
agent_visibility_grants_pkey: PRIMARY KEY (id)
agent_visibility_grants_agent_id_can_see_agent_id_key: UNIQUE (agent_id, can_see_agent_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins and supervisors can manage visibility grants" [command=ALL; roles=authenticated; PERMISSIVE]
"Agents can view own grants" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `agent_id` | `uuid` | não |  |  |  |
| 3 | `can_see_agent_id` | `uuid` | não |  |  |  |
| 4 | `granted_by` | `uuid` | sim |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| agent_visibility_grants_agent_id_can_see_agent_id_key | UNIQUE | `UNIQUE (agent_id, can_see_agent_id)` |  |  | sim |
| agent_visibility_grants_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| agent_visibility_grants_can_see_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (can_see_agent_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| agent_visibility_grants_granted_by_fkey | FOREIGN KEY | `FOREIGN KEY (granted_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| agent_visibility_grants_no_self_grant | CHECK | `CHECK (agent_id <> can_see_agent_id)` |  |  | sim |
| agent_visibility_grants_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| agent_visibility_grants_agent_id_can_see_agent_id_key | btree | agent_id, can_see_agent_id | sim | sim |  | `CREATE UNIQUE INDEX agent_visibility_grants_agent_id_can_see_agent_id_key ON public.agent_visibility_grants USING btree (agent_id, can_see_agent_id)` |
| agent_visibility_grants_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX agent_visibility_grants_pkey ON public.agent_visibility_grants USING btree (id)` |
| idx_agent_visibility_grants_agent_id | btree | agent_id | não | sim |  | `CREATE INDEX idx_agent_visibility_grants_agent_id ON public.agent_visibility_grants USING btree (agent_id)` |
| idx_agent_visibility_grants_can_see_agent_id | btree | can_see_agent_id | não | sim |  | `CREATE INDEX idx_agent_visibility_grants_can_see_agent_id ON public.agent_visibility_grants USING btree (can_see_agent_id)` |
| idx_agent_visibility_grants_granted_by | btree | granted_by | não | sim |  | `CREATE INDEX idx_agent_visibility_grants_granted_by ON public.agent_visibility_grants USING btree (granted_by)` |


## Policies (RLS)

### `Admins and supervisors can manage visibility grants`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Agents can view own grants`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(has_role(( SELECT auth.uid() AS uid), 'agent'::app_role) AND (agent_id IN ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid)))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
