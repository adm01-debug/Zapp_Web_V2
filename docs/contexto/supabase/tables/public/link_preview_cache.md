# public.link_preview_cache

> [RLS-sem-policy: intencional] Cache de previews de links. Populado pela edge function fetch-link-preview (service_role). Grants a anon/authenticated revogados em 20261026220300.

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
| 1 | `url_hash` | `text` | não |  |  |  |
| 2 | `url` | `text` | não |  |  |  |
| 3 | `preview` | `jsonb` | sim |  |  |  |
| 4 | `expires_at` | `timestamp with time zone` | não |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| link_preview_cache_pkey | PRIMARY KEY | `PRIMARY KEY (url_hash)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_link_preview_cache_expires_at | btree | expires_at | não | sim |  | `CREATE INDEX idx_link_preview_cache_expires_at ON public.link_preview_cache USING btree (expires_at)` |
| link_preview_cache_pkey | btree | url_hash | sim | sim |  | `CREATE UNIQUE INDEX link_preview_cache_pkey ON public.link_preview_cache USING btree (url_hash)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_link_preview_cache_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
