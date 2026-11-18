# public.entity_versions

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
| 2 | `entity_type` | `text` | não |  |  |  |
| 3 | `entity_id` | `uuid` | não |  |  |  |
| 4 | `version_number` | `integer` | não |  |  |  |
| 5 | `data` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 6 | `changed_by` | `uuid` | sim |  |  |  |
| 7 | `change_summary` | `text` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| entity_versions_entity_type_entity_id_version_number_key | UNIQUE | `UNIQUE (entity_type, entity_id, version_number)` |  |  | sim |
| entity_versions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| entity_versions_entity_type_entity_id_version_number_key | btree | entity_type, entity_id, version_number | sim | sim |  | `CREATE UNIQUE INDEX entity_versions_entity_type_entity_id_version_number_key ON public.entity_versions USING btree (entity_type, entity_id, version_number)` |
| entity_versions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX entity_versions_pkey ON public.entity_versions USING btree (id)` |
| idx_versions_date | btree | created_at | não | sim |  | `CREATE INDEX idx_versions_date ON public.entity_versions USING btree (created_at DESC)` |


## Policies (RLS)

### `Admins can view entity versions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Block authenticated version inserts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `false` |


## Triggers

_nenhum_


## Grants

_nenhum_
