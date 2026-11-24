# _bkp_261023.agent_stats

> [bkp-261023] Snapshot de public.agent_stats em 23/10/2026 (10 linhas).

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: _bkp_261023.agent_stats (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NULLABLE
2 profile_id uuid NULLABLE
3 xp bigint NULLABLE
4 level integer NULLABLE
5 achievements_count integer NULLABLE
6 messages_sent bigint NULLABLE
7 messages_received bigint NULLABLE
8 conversations_resolved integer NULLABLE
9 avg_response_time_seconds integer NULLABLE
10 customer_satisfaction_score numeric(3,2) NULLABLE
11 current_streak integer NULLABLE
12 best_streak integer NULLABLE
13 created_at timestamp with time zone NULLABLE
14 updated_at timestamp with time zone NULLABLE
Constraints:
(nenhuma PK/UNIQUE/FK/CHECK/EXCLUDE registrada)
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
| 1 | `id` | `uuid` | sim |  |  |  |
| 2 | `profile_id` | `uuid` | sim |  |  |  |
| 3 | `xp` | `bigint` | sim |  |  |  |
| 4 | `level` | `integer` | sim |  |  |  |
| 5 | `achievements_count` | `integer` | sim |  |  |  |
| 6 | `messages_sent` | `bigint` | sim |  |  |  |
| 7 | `messages_received` | `bigint` | sim |  |  |  |
| 8 | `conversations_resolved` | `integer` | sim |  |  |  |
| 9 | `avg_response_time_seconds` | `integer` | sim |  |  |  |
| 10 | `customer_satisfaction_score` | `numeric(3,2)` | sim |  |  |  |
| 11 | `current_streak` | `integer` | sim |  |  |  |
| 12 | `best_streak` | `integer` | sim |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | sim |  |  |  |
| 14 | `updated_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

_nenhum_


## Índices

_nenhum_


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
