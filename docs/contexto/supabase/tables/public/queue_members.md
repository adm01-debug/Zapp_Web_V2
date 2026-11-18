# public.queue_members

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `queue_id` | `uuid` | não |  |  |  |
| 3 | `profile_id` | `uuid` | não |  |  |  |
| 4 | `is_active` | `boolean` | sim | `true` |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| queue_members_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| queue_members_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| queue_members_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| queue_members_queue_id_profile_id_key | UNIQUE | `UNIQUE (queue_id, profile_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_queue_members_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_queue_members_profile_id ON public.queue_members USING btree (profile_id)` |
| idx_queue_members_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_queue_members_queue_id ON public.queue_members USING btree (queue_id)` |
| queue_members_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX queue_members_pkey ON public.queue_members USING btree (id)` |
| queue_members_queue_id_profile_id_key | btree | queue_id, profile_id | sim | sim |  | `CREATE UNIQUE INDEX queue_members_queue_id_profile_id_key ON public.queue_members USING btree (queue_id, profile_id)` |


## Policies (RLS)

### `Admins can manage queue members`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Queue members visible to admins or self`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR (profile_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| audit_queue_members_config | AFTER | INSERT OR DELETE OR UPDATE | ROW | enabled | public.audit_operational_config |


## Grants

_nenhum_
