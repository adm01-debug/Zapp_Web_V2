# public.scheduled_reports

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `report_type` | `text` | não | `'dashboard_summary'::text` |  |  |
| 4 | `frequency` | `text` | não | `'weekly'::text` |  |  |
| 5 | `recipients` | `text[]` | não | `'{}'::text[]` |  |  |
| 6 | `format` | `text` | não | `'pdf'::text` |  |  |
| 7 | `is_active` | `boolean` | sim | `true` |  |  |
| 8 | `next_send_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `last_sent_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `created_by` | `uuid` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| scheduled_reports_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| scheduled_reports_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX scheduled_reports_pkey ON public.scheduled_reports USING btree (id)` |


## Policies (RLS)

### `Admins can insert scheduled reports`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can manage scheduled reports`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can view scheduled reports`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_scheduled_reports_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
