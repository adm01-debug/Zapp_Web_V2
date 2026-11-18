# public.business_hours

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
| 2 | `whatsapp_connection_id` | `uuid` | não |  |  |  |
| 3 | `day_of_week` | `integer` | não |  |  |  |
| 4 | `is_open` | `boolean` | sim | `true` |  |  |
| 5 | `open_time` | `time without time zone` | sim | `'09:00:00'::time without time zone` |  |  |
| 6 | `close_time` | `time without time zone` | sim | `'18:00:00'::time without time zone` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| business_hours_day_of_week_check | CHECK | `CHECK (day_of_week >= 0 AND day_of_week <= 6)` |  |  | sim |
| business_hours_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| business_hours_whatsapp_connection_id_day_of_week_key | UNIQUE | `UNIQUE (whatsapp_connection_id, day_of_week)` |  |  | sim |
| business_hours_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| business_hours_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX business_hours_pkey ON public.business_hours USING btree (id)` |
| business_hours_whatsapp_connection_id_day_of_week_key | btree | whatsapp_connection_id, day_of_week | sim | sim |  | `CREATE UNIQUE INDEX business_hours_whatsapp_connection_id_day_of_week_key ON public.business_hours USING btree (whatsapp_connection_id, day_of_week)` |
| idx_business_hours_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_business_hours_whatsapp_connection_id ON public.business_hours USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can manage business hours`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated users can view business hours`

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
| update_business_hours_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
