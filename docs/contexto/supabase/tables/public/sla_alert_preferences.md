# public.sla_alert_preferences

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
| 1 | `user_id` | `uuid` | não |  |  |  |
| 2 | `enabled` | `boolean` | não | `true` |  |  |
| 3 | `alert_first_response` | `boolean` | não | `true` |  |  |
| 4 | `alert_resolution` | `boolean` | não | `true` |  |  |
| 5 | `severity_warning` | `boolean` | não | `true` |  |  |
| 6 | `severity_breached` | `boolean` | não | `true` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| sla_alert_preferences_pkey | PRIMARY KEY | `PRIMARY KEY (user_id)` |  |  | sim |
| sla_alert_preferences_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| sla_alert_preferences_pkey | btree | user_id | sim | sim |  | `CREATE UNIQUE INDEX sla_alert_preferences_pkey ON public.sla_alert_preferences USING btree (user_id)` |


## Policies (RLS)

### `sla_alert_preferences_insert_policy`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = auth.uid())` |

### `sla_alert_preferences_select_policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `sla_alert_preferences_update_policy`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK | `(user_id = auth.uid())` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| sla_alert_preferences_set_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
