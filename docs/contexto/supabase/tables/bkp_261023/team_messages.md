# _bkp_261023.team_messages

> [bkp-261023] Snapshot de public.team_messages em 23/10/2026 (2 linhas).

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
| 2 | `conversation_id` | `uuid` | sim |  |  |  |
| 3 | `sender_id` | `uuid` | sim |  |  |  |
| 4 | `content` | `text` | sim |  |  |  |
| 5 | `message_type` | `text` | sim |  |  |  |
| 6 | `reply_to_id` | `uuid` | sim |  |  |  |
| 7 | `is_edited` | `boolean` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `updated_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `media_url` | `text` | sim |  |  |  |
| 11 | `media_type` | `text` | sim |  |  |  |
| 12 | `status` | `text` | sim |  |  |  |
| 13 | `media_bucket` | `text` | sim |  |  |  |
| 14 | `media_path` | `text` | sim |  |  |  |
| 15 | `metadata` | `jsonb` | sim |  |  |  |


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
