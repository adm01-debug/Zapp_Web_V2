# public.webhook_rate_limits

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.webhook_rate_limits (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 instance_id text NOT NULL
3 event_type text NOT NULL
4 event_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 window_start timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
webhook_rate_limits_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can delete rate limits" [command=DELETE; roles=authenticated; PERMISSIVE]
"Admins can insert rate limits" [command=INSERT; roles=authenticated; PERMISSIVE]
"Admins can update rate limits" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Admins can view rate limits" [command=SELECT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `instance_id` | `text` | não |  |  |  |
| 3 | `event_type` | `text` | não |  |  |  |
| 4 | `event_count` | `integer` | não | `1` |  |  |
| 5 | `window_start` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| webhook_rate_limits_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_rate_limits_instance_window | btree | instance_id, window_start | não | sim |  | `CREATE INDEX idx_rate_limits_instance_window ON public.webhook_rate_limits USING btree (instance_id, window_start DESC)` |
| webhook_rate_limits_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX webhook_rate_limits_pkey ON public.webhook_rate_limits USING btree (id)` |


## Policies (RLS)

### `Admins can delete rate limits`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Admins can insert rate limits`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin(( SELECT auth.uid() AS uid))` |

### `Admins can update rate limits`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Admins can view rate limits`

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
