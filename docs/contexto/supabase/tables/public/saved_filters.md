# public.saved_filters

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `entity_type` | `text` | não |  |  |  |
| 4 | `name` | `text` | não |  |  |  |
| 5 | `filters` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 6 | `is_default` | `boolean` | sim | `false` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `is_shared` | `boolean` | sim | `false` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| saved_filters_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| saved_filters_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_saved_filters_user_entity | btree | user_id, entity_type | não | sim |  | `CREATE INDEX idx_saved_filters_user_entity ON public.saved_filters USING btree (user_id, entity_type)` |
| saved_filters_inbox_user_lower_name_key | btree | user_id | sim | sim | `(entity_type = 'inbox_filters'::text)` | `CREATE UNIQUE INDEX saved_filters_inbox_user_lower_name_key ON public.saved_filters USING btree (user_id, lower(name)) WHERE (entity_type = 'inbox_filters'::text)` |
| saved_filters_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX saved_filters_pkey ON public.saved_filters USING btree (id)` |


## Policies (RLS)

### `Users can delete own saved filters`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can insert own saved filters`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = auth.uid())` |

### `Users can update own saved filters`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can view own saved filters`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can view shared filters`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_shared = true)` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| enforce_saved_filters_inbox_limite_trigger | BEFORE | INSERT OR UPDATE | ROW | enabled | public.enforce_saved_filters_inbox_limite |
| ensure_single_default_filter_trigger | BEFORE | INSERT OR UPDATE | ROW | enabled | public.ensure_single_default_filter |
| update_saved_filters_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
