# public.team_chat_media_acl_r2_db_020_rb

> [RLS-sem-policy: intencional] Tabela de rebuild para ACL de mídia do Team Chat. Só service_role durante scripts de migração.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.team_chat_media_acl_r2_db_020_rb (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 message_id uuid NOT NULL
2 media_bucket text NULLABLE
3 media_path text NULLABLE
4 media_type text NULLABLE
5 recorded_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
team_chat_media_acl_r2_db_020_rb_pkey: PRIMARY KEY (message_id)
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
| 1 | `message_id` | `uuid` | não |  |  |  |
| 2 | `media_bucket` | `text` | sim |  |  |  |
| 3 | `media_path` | `text` | sim |  |  |  |
| 4 | `media_type` | `text` | sim |  |  |  |
| 5 | `recorded_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| team_chat_media_acl_r2_db_020_rb_pkey | PRIMARY KEY | `PRIMARY KEY (message_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| team_chat_media_acl_r2_db_020_rb_pkey | btree | message_id | sim | sim |  | `CREATE UNIQUE INDEX team_chat_media_acl_r2_db_020_rb_pkey ON public.team_chat_media_acl_r2_db_020_rb USING btree (message_id)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
