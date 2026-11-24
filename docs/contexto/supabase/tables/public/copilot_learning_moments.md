# public.copilot_learning_moments

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.copilot_learning_moments (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 conversation_id uuid NOT NULL
3 message_id text NOT NULL
4 tag text NOT NULL
5 notes text NULLABLE
6 tagged_by uuid NOT NULL
7 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
copilot_learning_moments_tag_check: CHECK (tag = ANY (ARRAY['exemplar'::text, 'anti_pattern'::text, 'objection_win'::text, 'closing_technique'::text]))
copilot_learning_moments_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
copilot_learning_moments_insert [command=INSERT; roles=authenticated; PERMISSIVE]
copilot_learning_moments_select [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `conversation_id` | `uuid` | não |  |  |  |
| 3 | `message_id` | `text` | não |  |  |  |
| 4 | `tag` | `text` | não |  |  |  |
| 5 | `notes` | `text` | sim |  |  |  |
| 6 | `tagged_by` | `uuid` | não |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_learning_moments_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| copilot_learning_moments_tag_check | CHECK | `CHECK (tag = ANY (ARRAY['exemplar'::text, 'anti_pattern'::text, 'objection_win'::text, 'closing_technique'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_learning_moments_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_learning_moments_pkey ON public.copilot_learning_moments USING btree (id)` |


## Policies (RLS)

### `copilot_learning_moments_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((tagged_by = ( SELECT auth.uid() AS uid)) AND is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |

### `copilot_learning_moments_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((tagged_by = ( SELECT auth.uid() AS uid)) OR (conversation_id IN ( SELECT copilot_sessions.conversation_id    FROM copilot_sessions   WHERE (copilot_sessions.profile_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
