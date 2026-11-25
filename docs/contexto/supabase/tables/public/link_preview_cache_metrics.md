# public.link_preview_cache_metrics

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.link_preview_cache_metrics (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 ran_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
3 deleted_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 remaining_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 table_size_bytes bigint NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 duration_ms integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
link_preview_cache_metrics_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins/supervisors can read metrics" [command=SELECT; roles=authenticated; PERMISSIVE]
"service_role inserts cache metrics" [command=INSERT; roles=service_role; PERMISSIVE]

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
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
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
