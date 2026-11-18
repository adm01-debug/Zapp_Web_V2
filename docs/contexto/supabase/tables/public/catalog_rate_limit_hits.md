# public.catalog_rate_limit_hits

> [RLS-sem-policy: intencional] Hits de rate limiting do catálogo de produtos. Gerenciado pela edge function promogifts-catalog via service_role.

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
| 1 | `id` | `bigint` | não | `nextval('catalog_rate_limit_hits_id_seq'::regclass)` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `action` | `text` | não |  |  |  |
| 4 | `hit_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| catalog_rate_limit_hits_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| catalog_rate_limit_hits_lookup_idx | btree | user_id, action, hit_at | não | sim |  | `CREATE INDEX catalog_rate_limit_hits_lookup_idx ON public.catalog_rate_limit_hits USING btree (user_id, action, hit_at DESC)` |
| catalog_rate_limit_hits_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX catalog_rate_limit_hits_pkey ON public.catalog_rate_limit_hits USING btree (id)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
