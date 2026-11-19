# _bkp_261023.contacts

> [bkp-261023] Snapshot da tabela public.contacts em 23/10/2026 (3730 linhas).

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
| 2 | `name` | `text` | sim |  |  |  |
| 3 | `phone` | `text` | sim |  |  |  |
| 4 | `email` | `text` | sim |  |  |  |
| 5 | `avatar_url` | `text` | sim |  |  |  |
| 6 | `assigned_to` | `uuid` | sim |  |  |  |
| 7 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 8 | `tags` | `text[]` | sim |  |  |  |
| 9 | `notes` | `text` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `updated_at` | `timestamp with time zone` | sim |  |  |  |
| 12 | `nickname` | `text` | sim |  |  |  |
| 13 | `surname` | `text` | sim |  |  |  |
| 14 | `job_title` | `text` | sim |  |  |  |
| 15 | `company` | `text` | sim |  |  |  |
| 16 | `queue_id` | `uuid` | sim |  |  |  |
| 17 | `contact_type` | `text` | sim |  |  |  |
| 18 | `ai_priority` | `text` | sim |  |  |  |
| 19 | `ai_sentiment` | `text` | sim |  |  |  |
| 20 | `channel_type` | `text` | sim |  |  |  |
| 21 | `channel_connection_id` | `uuid` | sim |  |  |  |
| 22 | `group_category` | `text` | sim |  |  |  |
| 23 | `lead_score` | `integer` | sim |  |  |  |
| 24 | `risk_score` | `integer` | sim |  |  |  |
| 25 | `lead_origin` | `text` | sim |  |  |  |
| 26 | `consent_status` | `text` | sim |  |  |  |
| 27 | `avatar_fetch_attempted_at` | `timestamp with time zone` | sim |  |  |  |
| 28 | `conversation_status` | `text` | sim |  |  |  |
| 29 | `conversation_status_changed_at` | `timestamp with time zone` | sim |  |  |  |
| 30 | `is_lid_legacy` | `boolean` | sim |  |  |  |
| 31 | `postal_code` | `text` | sim |  |  |  |
| 32 | `address` | `text` | sim |  |  |  |
| 33 | `address_number` | `text` | sim |  |  |  |
| 34 | `neighborhood` | `text` | sim |  |  |  |
| 35 | `city` | `text` | sim |  |  |  |
| 36 | `state` | `text` | sim |  |  |  |
| 37 | `latitude` | `double precision` | sim |  |  |  |
| 38 | `longitude` | `double precision` | sim |  |  |  |
| 39 | `deleted_at` | `timestamp with time zone` | sim |  |  |  |
| 40 | `ai_projection_updated_at` | `timestamp with time zone` | sim |  |  |  |
| 41 | `ai_projection_analysis_id` | `uuid` | sim |  |  |  |


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
