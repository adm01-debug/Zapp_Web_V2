# public.assistant_profiles

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.assistant_profiles (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 user_id uuid NOT NULL
2 atividade text NOT NULL [DEFAULT/EXPRESSION DEFINED]
3 foco text NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 ajuda text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 tom text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
assistant_profiles_ajuda_check: CHECK (ajuda = ANY (ARRAY['sempre'::text, 'relevante'::text, 'sob_demanda'::text]))
assistant_profiles_atividade_check: CHECK (atividade = ANY (ARRAY['venda'::text, 'compra'::text, 'atendimento'::text, 'supervisao'::text]))
assistant_profiles_tom_check: CHECK (tom = ANY (ARRAY['direto'::text, 'consultivo'::text, 'formal'::text]))
assistant_profiles_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
assistant_profiles_pkey: PRIMARY KEY (user_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
assistant_profiles_insert [command=INSERT; roles=authenticated; PERMISSIVE]
assistant_profiles_select [command=SELECT; roles=authenticated; PERMISSIVE]
assistant_profiles_update [command=UPDATE; roles=authenticated; PERMISSIVE]

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
| 1 | `user_id` | `uuid` | não |  |  |  |
| 2 | `atividade` | `text` | não | `'atendimento'::text` |  |  |
| 3 | `foco` | `text` | não | `''::text` |  |  |
| 4 | `ajuda` | `text` | não | `'relevante'::text` |  |  |
| 5 | `tom` | `text` | não | `'consultivo'::text` |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| assistant_profiles_ajuda_check | CHECK | `CHECK (ajuda = ANY (ARRAY['sempre'::text, 'relevante'::text, 'sob_demanda'::text]))` |  |  | sim |
| assistant_profiles_atividade_check | CHECK | `CHECK (atividade = ANY (ARRAY['venda'::text, 'compra'::text, 'atendimento'::text, 'supervisao'::text]))` |  |  | sim |
| assistant_profiles_pkey | PRIMARY KEY | `PRIMARY KEY (user_id)` |  |  | sim |
| assistant_profiles_tom_check | CHECK | `CHECK (tom = ANY (ARRAY['direto'::text, 'consultivo'::text, 'formal'::text]))` |  |  | sim |
| assistant_profiles_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| assistant_profiles_pkey | btree | user_id | sim | sim |  | `CREATE UNIQUE INDEX assistant_profiles_pkey ON public.assistant_profiles USING btree (user_id)` |


## Policies (RLS)

### `assistant_profiles_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |

### `assistant_profiles_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK |  |

### `assistant_profiles_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |


## Triggers

_nenhum_


## Grants

_nenhum_
