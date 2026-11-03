# public.queue_skill_requirements

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
| 2 | `queue_id` | `uuid` | não |  |  |  |
| 3 | `skill_name` | `text` | não |  |  |  |
| 4 | `min_level` | `integer` | sim | `1` |  |  |
| 5 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| queue_skill_requirements_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| queue_skill_requirements_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| queue_skill_requirements_queue_id_skill_name_key | UNIQUE | `UNIQUE (queue_id, skill_name)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_queue_skill_requirements_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_queue_skill_requirements_queue_id ON public.queue_skill_requirements USING btree (queue_id)` |
| queue_skill_requirements_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX queue_skill_requirements_pkey ON public.queue_skill_requirements USING btree (id)` |
| queue_skill_requirements_queue_id_skill_name_key | btree | queue_id, skill_name | sim | sim |  | `CREATE UNIQUE INDEX queue_skill_requirements_queue_id_skill_name_key ON public.queue_skill_requirements USING btree (queue_id, skill_name)` |


## Policies (RLS)

### `Admins can manage queue skills`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Authenticated can view queue skills`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
