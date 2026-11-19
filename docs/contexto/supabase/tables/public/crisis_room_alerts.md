# public.crisis_room_alerts

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
| 2 | `severity` | `text` | não | `'warning'::text` |  |  |
| 3 | `metric_name` | `text` | não |  |  |  |
| 4 | `metric_value` | `numeric` | sim |  |  |  |
| 5 | `threshold` | `numeric` | sim |  |  |  |
| 6 | `message` | `text` | não |  |  |  |
| 7 | `is_active` | `boolean` | sim | `true` |  |  |
| 8 | `acknowledged_by` | `uuid` | sim |  |  |  |
| 9 | `acknowledged_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| crisis_room_alerts_acknowledged_by_fkey | FOREIGN KEY | `FOREIGN KEY (acknowledged_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| crisis_room_alerts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| crisis_room_alerts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX crisis_room_alerts_pkey ON public.crisis_room_alerts USING btree (id)` |
| idx_crisis_room_alerts_acknowledged_by | btree | acknowledged_by | não | sim |  | `CREATE INDEX idx_crisis_room_alerts_acknowledged_by ON public.crisis_room_alerts USING btree (acknowledged_by)` |


## Policies (RLS)

### `Admins can delete crisis alerts`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can insert crisis alerts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can update crisis alerts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Authenticated can view crisis alerts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(auth.uid() IS NOT NULL)` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
