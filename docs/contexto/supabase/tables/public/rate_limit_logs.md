# public.rate_limit_logs

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.rate_limit_logs (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 ip_address text NOT NULL
3 endpoint text NOT NULL
4 user_id uuid NULLABLE
5 request_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 blocked boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 user_agent text NULLABLE
8 country text NULLABLE
9 city text NULLABLE
10 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
rate_limit_logs_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
rate_limit_logs_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can insert rate limit logs" [command=INSERT; roles=authenticated; PERMISSIVE]
"Admins can view rate limit logs" [command=SELECT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `ip_address` | `text` | não |  |  |  |
| 3 | `endpoint` | `text` | não |  |  |  |
| 4 | `user_id` | `uuid` | sim |  |  |  |
| 5 | `request_count` | `integer` | não | `1` |  |  |
| 6 | `blocked` | `boolean` | sim | `false` |  |  |
| 7 | `user_agent` | `text` | sim |  |  |  |
| 8 | `country` | `text` | sim |  |  |  |
| 9 | `city` | `text` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| rate_limit_logs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| rate_limit_logs_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_rate_limit_logs_created | btree | created_at | não | sim |  | `CREATE INDEX idx_rate_limit_logs_created ON public.rate_limit_logs USING btree (created_at)` |
| idx_rate_limit_logs_ip | btree | ip_address | não | sim |  | `CREATE INDEX idx_rate_limit_logs_ip ON public.rate_limit_logs USING btree (ip_address)` |
| idx_rate_limit_logs_user | btree | user_id | não | sim |  | `CREATE INDEX idx_rate_limit_logs_user ON public.rate_limit_logs USING btree (user_id)` |
| rate_limit_logs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX rate_limit_logs_pkey ON public.rate_limit_logs USING btree (id)` |


## Policies (RLS)

### `Admins can insert rate limit logs`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Admins can view rate limit logs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
