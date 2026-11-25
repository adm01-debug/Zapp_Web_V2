# public.catalog_rate_limit_hits

> [RLS-sem-policy: intencional] Hits de rate limiting do catálogo de produtos. Gerenciado pela edge function promogifts-catalog via service_role.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.catalog_rate_limit_hits (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id bigint NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 user_id uuid NOT NULL
3 action text NOT NULL
4 hit_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
catalog_rate_limit_hits_pkey: PRIMARY KEY (id)
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
