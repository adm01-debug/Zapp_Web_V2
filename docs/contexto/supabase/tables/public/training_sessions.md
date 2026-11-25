# public.training_sessions

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.training_sessions (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 profile_id uuid NOT NULL
3 scenario_name text NOT NULL
4 scenario_type text NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 messages jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
6 score integer NULLABLE
7 feedback text NULLABLE
8 status text NULLABLE [DEFAULT/EXPRESSION DEFINED]
9 started_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
10 completed_at timestamp with time zone NULLABLE
11 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
training_sessions_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
training_sessions_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Users can delete own training sessions" [command=DELETE; roles=authenticated; PERMISSIVE]
"Users can insert own training sessions" [command=INSERT; roles=authenticated; PERMISSIVE]
"Users can update own training sessions" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Users can view own training sessions" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `profile_id` | `uuid` | não |  |  |  |
| 3 | `scenario_name` | `text` | não |  |  |  |
| 4 | `scenario_type` | `text` | sim | `'general'::text` |  |  |
| 5 | `messages` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 6 | `score` | `integer` | sim |  |  |  |
| 7 | `feedback` | `text` | sim |  |  |  |
| 8 | `status` | `text` | sim | `'in_progress'::text` |  |  |
| 9 | `started_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| training_sessions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| training_sessions_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_training_sessions_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_training_sessions_profile_id ON public.training_sessions USING btree (profile_id)` |
| training_sessions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX training_sessions_pkey ON public.training_sessions USING btree (id)` |


## Policies (RLS)

### `Users can delete own training sessions`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((profile_id = get_profile_id_for_user(( SELECT auth.uid() AS uid))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `Users can insert own training sessions`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((profile_id = get_profile_id_for_user(( SELECT auth.uid() AS uid))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |

### `Users can update own training sessions`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((profile_id = get_profile_id_for_user(( SELECT auth.uid() AS uid))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `Users can view own training sessions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((profile_id = get_profile_id_for_user(( SELECT auth.uid() AS uid))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
