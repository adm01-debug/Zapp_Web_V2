# public.queue_positions

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
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `queue_id` | `uuid` | não |  |  |  |
| 4 | `position` | `integer` | não | `0` |  |  |
| 5 | `estimated_wait_minutes` | `integer` | sim |  |  |  |
| 6 | `entered_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 7 | `notified` | `boolean` | sim | `false` |  |  |
| 8 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| queue_positions_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id)` | NO ACTION | NO ACTION | sim |
| queue_positions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| queue_positions_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_queue_positions_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_queue_positions_contact_id ON public.queue_positions USING btree (contact_id)` |
| idx_queue_positions_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_queue_positions_queue_id ON public.queue_positions USING btree (queue_id)` |
| queue_positions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX queue_positions_pkey ON public.queue_positions USING btree (id)` |


## Policies (RLS)

### `Admins can manage queue positions`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Users can view queue positions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
