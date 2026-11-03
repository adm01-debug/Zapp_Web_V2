# public.connection_alert_preferences

> Preferencias por usuario de alerta de conexao (canais: navegador/e-mail; tipos: degradada/desconectada). Uma linha por usuario; RLS por linha; sem DELETE.

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
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `push_enabled` | `boolean` | não | `true` |  |  |
| 4 | `email_enabled` | `boolean` | não | `true` |  |  |
| 5 | `alert_on_degraded` | `boolean` | não | `true` |  |  |
| 6 | `alert_on_disconnected` | `boolean` | não | `true` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| connection_alert_preferences_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| connection_alert_preferences_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| connection_alert_preferences_user_id_key | UNIQUE | `UNIQUE (user_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| connection_alert_preferences_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX connection_alert_preferences_pkey ON public.connection_alert_preferences USING btree (id)` |
| connection_alert_preferences_user_id_key | btree | user_id | sim | sim |  | `CREATE UNIQUE INDEX connection_alert_preferences_user_id_key ON public.connection_alert_preferences USING btree (user_id)` |


## Policies (RLS)

### `connection_alert_preferences_delete_own`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `connection_alert_preferences_insert_own`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = ( SELECT auth.uid() AS uid))` |

### `connection_alert_preferences_select_own`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `connection_alert_preferences_update_own`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK | `(user_id = ( SELECT auth.uid() AS uid))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| set_connection_alert_preferences_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
