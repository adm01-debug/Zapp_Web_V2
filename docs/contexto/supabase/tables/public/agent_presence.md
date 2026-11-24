# public.agent_presence

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.agent_presence (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 user_id uuid NOT NULL
2 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
3 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
agent_presence_status_check: CHECK (status = ANY (ARRAY['online'::text, 'away'::text, 'offline'::text]))
agent_presence_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
agent_presence_pkey: PRIMARY KEY (user_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Authenticated can read all presence" [command=SELECT; roles=authenticated; PERMISSIVE]
"Users can insert own presence" [command=INSERT; roles=authenticated; PERMISSIVE]
"Users can update own presence" [command=UPDATE; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `user_id` | `uuid` | não |  |  |  |
| 2 | `status` | `text` | não | `'online'::text` |  |  |
| 3 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| agent_presence_pkey | PRIMARY KEY | `PRIMARY KEY (user_id)` |  |  | sim |
| agent_presence_status_check | CHECK | `CHECK (status = ANY (ARRAY['online'::text, 'away'::text, 'offline'::text]))` |  |  | sim |
| agent_presence_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| agent_presence_pkey | btree | user_id | sim | sim |  | `CREATE UNIQUE INDEX agent_presence_pkey ON public.agent_presence USING btree (user_id)` |


## Policies (RLS)

### `Authenticated can read all presence`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `Users can insert own presence`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |

### `Users can update own presence`

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
