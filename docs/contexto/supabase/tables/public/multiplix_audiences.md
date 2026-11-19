# public.multiplix_audiences

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `kind` | `text` | não |  |  |  |
| 4 | `definition` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 5 | `owner_id` | `uuid` | sim |  |  |  |
| 6 | `shared_with_roles` | `text[]` | não | `'{}'::text[]` |  |  |
| 7 | `last_used_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `cached_count` | `integer` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_audiences_kind_check | CHECK | `CHECK (kind = ANY (ARRAY['rule'::text, 'static_list'::text]))` |  |  | sim |
| multiplix_audiences_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.multiplix_audience_members | multiplix_audience_members_audience_id_fkey | audience_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_audiences_owner_id | btree | owner_id | não | sim |  | `CREATE INDEX idx_multiplix_audiences_owner_id ON public.multiplix_audiences USING btree (owner_id)` |
| multiplix_audiences_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_audiences_pkey ON public.multiplix_audiences USING btree (id)` |


## Policies (RLS)

### `Users can create audiences`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) AND (owner_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)))` |

### `Users can delete own audiences`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) AND (owner_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)))` |
| WITH CHECK |  |

### `Users can update own audiences`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) AND (owner_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)))` |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) AND (owner_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)))` |

### `Users can view own or shared audiences`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((owner_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)) OR (EXISTS ( SELECT 1    FROM unnest(multiplix_audiences.shared_with_roles) shared(role_name)   WHERE has_role(auth.uid(), (shared.role_name)::app_role))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_multiplix_audiences_validate_shared_roles | BEFORE | INSERT OR UPDATE | ROW | enabled | public.multiplix_audiences_validate_shared_roles |
| update_multiplix_audiences_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
