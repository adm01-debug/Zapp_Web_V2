# public.voip_profile_credentials

> [RLS-sem-policy: intencional] Credenciais SIP por perfil. Escrita/leitura pela RPC security-definer set_voip_profile_credentials. Sem grant a anon/authenticated.

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
| 2 | `profile_id` | `uuid` | não |  |  |  |
| 3 | `ramal` | `text` | não |  |  | Ramal/usuário SIP do atendente. Único sem diferenciar maiúsculas/minúsculas: um ramal pertence a um único atendente. |
| 4 | `vault_secret_id` | `uuid` | não |  |  | id do segredo em vault.secrets. A senha é decifrada apenas dentro das RPCs SECURITY DEFINER deste arquivo. |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| voip_profile_credentials_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| voip_profile_credentials_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| voip_profile_credentials_profile_id_key | UNIQUE | `UNIQUE (profile_id)` |  |  | sim |
| voip_profile_credentials_ramal_check | CHECK | `CHECK (ramal ~ '^[0-9A-Za-z][0-9A-Za-z._@+-]{0,63}$'::text)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| voip_profile_credentials_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX voip_profile_credentials_pkey ON public.voip_profile_credentials USING btree (id)` |
| voip_profile_credentials_profile_id_key | btree | profile_id | sim | sim |  | `CREATE UNIQUE INDEX voip_profile_credentials_profile_id_key ON public.voip_profile_credentials USING btree (profile_id)` |
| voip_profile_credentials_ramal_lower_key | btree |  | sim | sim |  | `CREATE UNIQUE INDEX voip_profile_credentials_ramal_lower_key ON public.voip_profile_credentials USING btree (lower(ramal))` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_voip_profile_credentials_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
