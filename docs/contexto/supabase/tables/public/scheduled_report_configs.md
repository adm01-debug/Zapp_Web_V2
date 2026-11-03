# public.scheduled_report_configs

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
| 3 | `report_type` | `text` | não | `'dashboard'::text` |  |  |
| 4 | `frequency` | `text` | não | `'weekly'::text` |  |  |
| 5 | `recipients` | `text[]` | não | `'{}'::text[]` |  |  |
| 6 | `is_active` | `boolean` | não | `true` |  |  |
| 7 | `last_sent_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `next_send_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `created_by` | `uuid` | sim |  |  |  |
| 10 | `config` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| scheduled_report_configs_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| scheduled_report_configs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_scheduled_report_configs_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_scheduled_report_configs_created_by ON public.scheduled_report_configs USING btree (created_by)` |
| scheduled_report_configs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX scheduled_report_configs_pkey ON public.scheduled_report_configs USING btree (id)` |


## Policies (RLS)

### `Admin/supervisor can insert report configs`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) AND (is_admin(auth.uid()) OR (created_by IS NULL) OR (created_by = get_profile_id_for_user(auth.uid()))))` |

### `Owner or admin can delete report configs`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin(auth.uid()) OR (created_by = get_profile_id_for_user(auth.uid())))` |
| WITH CHECK |  |

### `Owner or admin can read report configs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin(auth.uid()) OR (created_by = get_profile_id_for_user(auth.uid())))` |
| WITH CHECK |  |

### `Owner or admin can update report configs`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin(auth.uid()) OR (created_by = get_profile_id_for_user(auth.uid())))` |
| WITH CHECK | `(is_admin(auth.uid()) OR (created_by = get_profile_id_for_user(auth.uid())))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_set_scheduled_report_config_owner | BEFORE | INSERT | ROW | enabled | public.set_scheduled_report_config_owner |
| update_scheduled_report_configs_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
