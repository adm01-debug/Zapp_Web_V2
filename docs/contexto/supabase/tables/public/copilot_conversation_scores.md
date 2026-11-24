# public.copilot_conversation_scores

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.copilot_conversation_scores (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 conversation_id uuid NOT NULL
2 score integer NOT NULL
3 scored_by uuid NOT NULL
4 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
copilot_conversation_scores_score_check: CHECK (score >= 1 AND score <= 5)
copilot_conversation_scores_pkey: PRIMARY KEY (conversation_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
copilot_conversation_scores_insert [command=INSERT; roles=authenticated; PERMISSIVE]
copilot_conversation_scores_select [command=SELECT; roles=authenticated; PERMISSIVE]
copilot_conversation_scores_update [command=UPDATE; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `conversation_id` | `uuid` | não |  |  |  |
| 2 | `score` | `integer` | não |  |  |  |
| 3 | `scored_by` | `uuid` | não |  |  |  |
| 4 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_conversation_scores_pkey | PRIMARY KEY | `PRIMARY KEY (conversation_id)` |  |  | sim |
| copilot_conversation_scores_score_check | CHECK | `CHECK (score >= 1 AND score <= 5)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_conversation_scores_pkey | btree | conversation_id | sim | sim |  | `CREATE UNIQUE INDEX copilot_conversation_scores_pkey ON public.copilot_conversation_scores USING btree (conversation_id)` |


## Policies (RLS)

### `copilot_conversation_scores_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((scored_by = ( SELECT auth.uid() AS uid)) AND is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |

### `copilot_conversation_scores_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((scored_by = ( SELECT auth.uid() AS uid)) OR (conversation_id IN ( SELECT copilot_sessions.conversation_id    FROM copilot_sessions   WHERE (copilot_sessions.profile_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `copilot_conversation_scores_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `((scored_by = ( SELECT auth.uid() AS uid)) AND is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |


## Triggers

_nenhum_


## Grants

_nenhum_
