# public.multiplix_audience_members

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | sim |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `audience_id` | `uuid` | não |  |  |  |
| 3 | `singu_company_id` | `uuid` | sim |  |  |  |
| 4 | `singu_contact_id` | `uuid` | sim |  |  |  |
| 5 | `added_reason` | `text` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_audience_members_audience_id_fkey | FOREIGN KEY | `FOREIGN KEY (audience_id) REFERENCES multiplix_audiences(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| multiplix_audience_members_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_audience_members_audience_id | btree | audience_id | não | sim |  | `CREATE INDEX idx_multiplix_audience_members_audience_id ON public.multiplix_audience_members USING btree (audience_id)` |
| multiplix_audience_members_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_audience_members_pkey ON public.multiplix_audience_members USING btree (id)` |


## Policies (RLS)

### `Users can delete members of own audiences`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_audiences ma   WHERE ((ma.id = multiplix_audience_members.audience_id) AND (ma.owner_id = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1))))))` |
| WITH CHECK |  |

### `Users can insert members into own audiences`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_audiences ma   WHERE ((ma.id = multiplix_audience_members.audience_id) AND (ma.owner_id = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1))))))` |

### `Users can update members of own audiences`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_audiences ma   WHERE ((ma.id = multiplix_audience_members.audience_id) AND (ma.owner_id = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1))))))` |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM multiplix_audiences ma   WHERE ((ma.id = multiplix_audience_members.audience_id) AND (ma.owner_id = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1))))))` |

### `Users can view members of accessible audiences`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM multiplix_audiences ma   WHERE ((ma.id = multiplix_audience_members.audience_id) AND ((ma.owner_id = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) OR (EXISTS ( SELECT 1            FROM unnest(ma.shared_with_roles) shared(role_name)           WHERE has_role(auth.uid(), (shared.role_name)::app_role)))))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
