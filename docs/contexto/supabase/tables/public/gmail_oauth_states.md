# public.gmail_oauth_states

> [RLS-sem-policy: intencional] Estados temporários do fluxo OAuth do Gmail (PKCE/state). Criados e consumidos pela edge function gmail-oauth (service_role). Expiração automática.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 0 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `state` | `text` | não |  |  |  |
| 4 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 5 | `expires_at` | `timestamp with time zone` | não | `(now() + '00:10:00'::interval)` |  |  |
| 6 | `consumed_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| gmail_oauth_states_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| gmail_oauth_states_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| gmail_oauth_states_open_user_state_idx | btree | user_id, state | não | sim | `(consumed_at IS NULL)` | `CREATE INDEX gmail_oauth_states_open_user_state_idx ON public.gmail_oauth_states USING btree (user_id, state) WHERE (consumed_at IS NULL)` |
| gmail_oauth_states_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX gmail_oauth_states_pkey ON public.gmail_oauth_states USING btree (id)` |
| idx_gmail_oauth_states_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_gmail_oauth_states_user_id ON public.gmail_oauth_states USING btree (user_id)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
