# public.deal_activities

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
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Agents can view activities on their deals`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR (performed_by = get_profile_id_for_user(auth.uid())) OR (deal_id IN ( SELECT sd.id    FROM sales_deals sd   WHERE (sd.assigned_to = get_profile_id_for_user(auth.uid())))))` |
| WITH CHECK |  |

### `Authenticated can insert deal activities`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((performed_by = get_profile_id_for_user(auth.uid())) AND (is_admin_or_supervisor(auth.uid()) OR (deal_id IN ( SELECT deal.id    FROM sales_deals deal   WHERE (deal.assigned_to = get_profile_id_for_user(auth.uid()))))))` |


## Triggers

_nenhum_


## Grants

_nenhum_
