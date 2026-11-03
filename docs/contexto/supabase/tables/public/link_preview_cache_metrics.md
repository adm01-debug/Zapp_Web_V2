# public.link_preview_cache_metrics

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `ran_at` | `timestamp with time zone` | não | `now()` |  |  |
| 3 | `deleted_count` | `integer` | não | `0` |  |  |
| 4 | `remaining_count` | `integer` | não | `0` |  |  |
| 5 | `table_size_bytes` | `bigint` | não | `0` |  |  |
| 6 | `duration_ms` | `integer` | não | `0` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| link_preview_cache_metrics_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| link_preview_cache_metrics_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX link_preview_cache_metrics_pkey ON public.link_preview_cache_metrics USING btree (id)` |


## Policies (RLS)

### `Admins/supervisors can read metrics`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `service_role inserts cache metrics`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | service_role |
| USING |  |
| WITH CHECK | `true` |


## Triggers

_nenhum_


## Grants

_nenhum_
