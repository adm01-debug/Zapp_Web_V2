# public.performance_snapshots

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.performance_snapshots (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 profile_id uuid NOT NULL
3 fcp integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
4 page_load integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 dom_ready integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
6 ttfb integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 memory_used integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
8 memory_total integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
9 dom_nodes integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
10 network_type text NULLABLE [DEFAULT/EXPRESSION DEFINED]
11 rtt integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
12 overall_score integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
13 user_agent text NULLABLE
14 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
performance_snapshots_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
performance_snapshots_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can delete performance snapshots" [command=DELETE; roles=authenticated; PERMISSIVE]
"Admins can view all performance snapshots" [command=SELECT; roles=authenticated; PERMISSIVE]
"Users can insert own performance snapshots" [command=INSERT; roles=authenticated; PERMISSIVE]
"Users can view own performance snapshots" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 3 | `fcp` | `integer` | sim | `0` |  |  |
| 4 | `page_load` | `integer` | sim | `0` |  |  |
| 5 | `dom_ready` | `integer` | sim | `0` |  |  |
| 6 | `ttfb` | `integer` | sim | `0` |  |  |
| 7 | `memory_used` | `integer` | sim | `0` |  |  |
| 8 | `memory_total` | `integer` | sim | `0` |  |  |
| 9 | `dom_nodes` | `integer` | sim | `0` |  |  |
| 10 | `network_type` | `text` | sim | `'4g'::text` |  |  |
| 11 | `rtt` | `integer` | sim | `0` |  |  |
| 12 | `overall_score` | `integer` | sim | `0` |  |  |
| 13 | `user_agent` | `text` | sim |  |  |  |
| 14 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| performance_snapshots_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| performance_snapshots_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_performance_snapshots_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_performance_snapshots_created_at ON public.performance_snapshots USING btree (created_at DESC)` |
| idx_performance_snapshots_profile | btree | profile_id | não | sim |  | `CREATE INDEX idx_performance_snapshots_profile ON public.performance_snapshots USING btree (profile_id)` |
| performance_snapshots_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX performance_snapshots_pkey ON public.performance_snapshots USING btree (id)` |


## Policies (RLS)

### `Admins can delete performance snapshots`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Admins can view all performance snapshots`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Users can insert own performance snapshots`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(profile_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1))` |

### `Users can view own performance snapshots`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(profile_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
