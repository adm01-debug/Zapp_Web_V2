# public._rb_message_reactions_contato_20261007001008

> [RLS-sem-policy: intencional] Tabela de rebuild de 07/10/2026. Acesso apenas por service_role durante scripts de reconciliação.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public._rb_message_reactions_contato_20261007001008 (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 reaction_id uuid NOT NULL
2 contact_id_original uuid NOT NULL
Constraints:
_rb_message_reactions_contato_20261007001008_pkey: PRIMARY KEY (reaction_id)
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
| 1 | `reaction_id` | `uuid` | não |  |  |  |
| 2 | `contact_id_original` | `uuid` | não |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| _rb_message_reactions_contato_20261007001008_pkey | PRIMARY KEY | `PRIMARY KEY (reaction_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| _rb_message_reactions_contato_20261007001008_pkey | btree | reaction_id | sim | sim |  | `CREATE UNIQUE INDEX _rb_message_reactions_contato_20261007001008_pkey ON public._rb_message_reactions_contato_20261007001008 USING btree (reaction_id)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
