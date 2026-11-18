# public.edge_rate_limits

> [RLS-sem-policy: intencional] Bucket de rate limiting das edge functions. Escrito/lido pelo middleware de rate limit (service_role). Cron cleanup-edge-rate-limits purga a cada 15 min.

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
| 1 | `key` | `text` | não |  |  |  |
| 2 | `window_start` | `timestamp with time zone` | não | `now()` |  |  |
| 3 | `hits` | `integer` | não | `0` |  |  |
| 4 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| edge_rate_limits_pkey | PRIMARY KEY | `PRIMARY KEY (key)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| edge_rate_limits_pkey | btree | key | sim | sim |  | `CREATE UNIQUE INDEX edge_rate_limits_pkey ON public.edge_rate_limits USING btree (key)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
