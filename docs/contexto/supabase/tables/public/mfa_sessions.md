# public.mfa_sessions

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 1 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `factor_id` | `text` | não |  |  |  |
| 4 | `verified_at` | `timestamp with time zone` | sim |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `expires_at` | `timestamp with time zone` | não | `(now() + '00:05:00'::interval)` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| mfa_sessions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| mfa_sessions_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_mfa_sessions_user | btree | user_id | não | sim |  | `CREATE INDEX idx_mfa_sessions_user ON public.mfa_sessions USING btree (user_id)` |
| mfa_sessions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX mfa_sessions_pkey ON public.mfa_sessions USING btree (id)` |


## Policies (RLS)

### `Users can manage own MFA sessions`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK | `(user_id = auth.uid())` |


## Triggers

_nenhum_


## Grants

_nenhum_
