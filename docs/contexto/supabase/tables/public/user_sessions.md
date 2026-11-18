# public.user_sessions

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
| 3 | `device_id` | `uuid` | sim |  |  |  |
| 4 | `ip_address` | `text` | sim |  |  |  |
| 5 | `user_agent` | `text` | sim |  |  |  |
| 6 | `is_active` | `boolean` | sim | `true` |  |  |
| 7 | `started_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `last_activity_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `expires_at` | `timestamp with time zone` | não | `(now() + '24:00:00'::interval)` |  |  |
| 10 | `ended_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `auth_session_id` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| user_sessions_device_id_fkey | FOREIGN KEY | `FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| user_sessions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| user_sessions_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_user_sessions_active | btree | is_active | não | sim | `(is_active = true)` | `CREATE INDEX idx_user_sessions_active ON public.user_sessions USING btree (is_active) WHERE (is_active = true)` |
| idx_user_sessions_auth_session_id | btree | auth_session_id | sim | sim | `(auth_session_id IS NOT NULL)` | `CREATE UNIQUE INDEX idx_user_sessions_auth_session_id ON public.user_sessions USING btree (auth_session_id) WHERE (auth_session_id IS NOT NULL)` |
| idx_user_sessions_device_id | btree | device_id | não | sim |  | `CREATE INDEX idx_user_sessions_device_id ON public.user_sessions USING btree (device_id)` |
| idx_user_sessions_user_auth_session | btree | user_id, auth_session_id | não | sim |  | `CREATE INDEX idx_user_sessions_user_auth_session ON public.user_sessions USING btree (user_id, auth_session_id)` |
| idx_user_sessions_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id)` |
| user_sessions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX user_sessions_pkey ON public.user_sessions USING btree (id)` |


## Policies (RLS)

### `Authenticated can insert own sessions`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = auth.uid())` |

### `Users can delete their own sessions`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can update their own sessions`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can view their own sessions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_user_sessions_auth_session_guard | BEFORE | INSERT OR UPDATE | ROW | enabled | public.trg_user_sessions_auth_session_guard |


## Grants

_nenhum_
