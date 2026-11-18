# _bkp_261023.csat_surveys

> [bkp-261023] Snapshot de public.csat_surveys em 23/10/2026 (0 linhas).

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
| 2 | `contact_id` | `uuid` | sim |  |  |  |
| 3 | `agent_id` | `uuid` | sim |  |  |  |
| 4 | `rating` | `integer` | sim |  |  |  |
| 5 | `feedback` | `text` | sim |  |  |  |
| 6 | `conversation_resolved_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | sim |  |  |  |


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
