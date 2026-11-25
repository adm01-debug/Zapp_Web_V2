# public.rate_limit_configs

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.rate_limit_configs (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 endpoint_pattern text NOT NULL
4 max_requests integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 window_seconds integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 block_duration_minutes integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 is_active boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
8 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
rate_limit_configs_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage rate limit configs" [command=ALL; roles=authenticated; PERMISSIVE]
"Admins can read rate limit configs" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `endpoint_pattern` | `text` | não |  |  |  |
| 4 | `max_requests` | `integer` | não | `100` |  |  |
| 5 | `window_seconds` | `integer` | não | `60` |  |  |
| 6 | `block_duration_minutes` | `integer` | não | `15` |  |  |
| 7 | `is_active` | `boolean` | sim | `true` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| rate_limit_configs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| rate_limit_configs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX rate_limit_configs_pkey ON public.rate_limit_configs USING btree (id)` |


## Policies (RLS)

### `Admins can manage rate limit configs`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin(( SELECT auth.uid() AS uid))` |

### `Admins can read rate limit configs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| audit_rate_limit_configs_config | AFTER | INSERT OR DELETE OR UPDATE | ROW | enabled | public.audit_operational_config |
| update_rate_limit_configs_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
