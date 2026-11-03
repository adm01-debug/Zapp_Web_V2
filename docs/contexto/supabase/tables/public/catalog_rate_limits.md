# public.catalog_rate_limits

> [RLS-sem-policy: intencional] Configuração de rate limits do catálogo. Gerenciado pela edge function promogifts-catalog via service_role.

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
| 1 | `user_id` | `uuid` | não |  |  |  |
| 2 | `action` | `text` | não |  |  |  |
| 3 | `window_start` | `timestamp with time zone` | não | `now()` |  |  |
| 4 | `count` | `integer` | não |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| catalog_rate_limits_pkey | PRIMARY KEY | `PRIMARY KEY (user_id, action)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| catalog_rate_limits_pkey | btree | user_id, action | sim | sim |  | `CREATE UNIQUE INDEX catalog_rate_limits_pkey ON public.catalog_rate_limits USING btree (user_id, action)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
