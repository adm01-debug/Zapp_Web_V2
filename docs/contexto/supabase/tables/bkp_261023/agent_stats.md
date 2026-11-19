# _bkp_261023.agent_stats

> [bkp-261023] Snapshot de public.agent_stats em 23/10/2026 (10 linhas).

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | não |
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

> ⚠️ RLS **desabilitado** nesta tabela.



## Triggers

_nenhum_


## Grants

_nenhum_
