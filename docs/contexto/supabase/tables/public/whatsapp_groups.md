# public.whatsapp_groups

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
| 2 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 3 | `group_id` | `text` | não |  |  |  |
| 4 | `name` | `text` | não |  |  |  |
| 5 | `description` | `text` | sim |  |  |  |
| 6 | `participant_count` | `integer` | sim | `0` |  |  |
| 7 | `avatar_url` | `text` | sim |  |  |  |
| 8 | `is_admin` | `boolean` | sim | `false` |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `category` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| whatsapp_groups_group_id_key | UNIQUE | `UNIQUE (group_id)` |  |  | sim |
| whatsapp_groups_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| whatsapp_groups_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.messages | messages_whatsapp_group_id_fkey | whatsapp_group_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_whatsapp_groups_category | btree | category | não | sim |  | `CREATE INDEX idx_whatsapp_groups_category ON public.whatsapp_groups USING btree (category)` |
| idx_whatsapp_groups_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_whatsapp_groups_whatsapp_connection_id ON public.whatsapp_groups USING btree (whatsapp_connection_id)` |
| whatsapp_groups_group_id_key | btree | group_id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_groups_group_id_key ON public.whatsapp_groups USING btree (group_id)` |
| whatsapp_groups_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_groups_pkey ON public.whatsapp_groups USING btree (id)` |


## Policies (RLS)

### `Admins can manage whatsapp groups`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated users can view whatsapp groups`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_whatsapp_groups_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
