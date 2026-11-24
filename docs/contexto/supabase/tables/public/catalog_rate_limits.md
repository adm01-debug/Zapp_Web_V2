# public.catalog_rate_limits

> [RLS-sem-policy: intencional] Configuração de rate limits do catálogo. Gerenciado pela edge function promogifts-catalog via service_role.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.catalog_rate_limits (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 user_id uuid NOT NULL
2 action text NOT NULL
3 window_start timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 count integer NOT NULL
Constraints:
catalog_rate_limits_pkey: PRIMARY KEY (user_id, action)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
(RLS habilitada sem política; verificar se o acesso restrito é intencional)

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
