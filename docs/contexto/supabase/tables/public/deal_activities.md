# public.deal_activities

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.deal_activities (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 deal_id uuid NOT NULL
3 activity_type text NOT NULL
4 description text NULLABLE
5 performed_by uuid NULLABLE
6 created_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
deal_activities_deal_id_fkey: FOREIGN KEY (deal_id) REFERENCES sales_deals(id) ON DELETE CASCADE
deal_activities_performed_by_fkey: FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE SET NULL
deal_activities_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can view deal activities" [command=SELECT; roles=authenticated; PERMISSIVE]
"Agents can view activities on their deals" [command=SELECT; roles=authenticated; PERMISSIVE]
"Authenticated can insert deal activities" [command=INSERT; roles=authenticated; PERMISSIVE]

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
| 2 | `deal_id` | `uuid` | não |  |  |  |
| 3 | `activity_type` | `text` | não |  |  |  |
| 4 | `description` | `text` | sim |  |  |  |
| 5 | `performed_by` | `uuid` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| deal_activities_deal_id_fkey | FOREIGN KEY | `FOREIGN KEY (deal_id) REFERENCES sales_deals(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| deal_activities_performed_by_fkey | FOREIGN KEY | `FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| deal_activities_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| deal_activities_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX deal_activities_pkey ON public.deal_activities USING btree (id)` |
| idx_deal_activities_deal_id | btree | deal_id | não | sim |  | `CREATE INDEX idx_deal_activities_deal_id ON public.deal_activities USING btree (deal_id)` |
| idx_deal_activities_performed_by | btree | performed_by | não | sim |  | `CREATE INDEX idx_deal_activities_performed_by ON public.deal_activities USING btree (performed_by)` |


## Policies (RLS)

### `Admins can view deal activities`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Agents can view activities on their deals`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR (performed_by = get_profile_id_for_user(( SELECT auth.uid() AS uid))) OR (deal_id IN ( SELECT sd.id    FROM sales_deals sd   WHERE (sd.assigned_to = get_profile_id_for_user(( SELECT auth.uid() AS uid))))))` |
| WITH CHECK |  |

### `Authenticated can insert deal activities`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((performed_by = get_profile_id_for_user(( SELECT auth.uid() AS uid))) AND (is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR (deal_id IN ( SELECT deal.id    FROM sales_deals deal   WHERE (deal.assigned_to = get_profile_id_for_user(( SELECT auth.uid() AS uid)))))))` |


## Triggers

_nenhum_


## Grants

_nenhum_
