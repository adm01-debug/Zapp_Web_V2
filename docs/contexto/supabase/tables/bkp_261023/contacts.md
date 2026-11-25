# _bkp_261023.contacts

> [bkp-261023] Snapshot da tabela public.contacts em 23/10/2026 (3730 linhas).

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: _bkp_261023.contacts (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NULLABLE
2 name text NULLABLE
3 phone text NULLABLE
4 email text NULLABLE
5 avatar_url text NULLABLE
6 assigned_to uuid NULLABLE
7 whatsapp_connection_id uuid NULLABLE
8 tags text[] NULLABLE
9 notes text NULLABLE
10 created_at timestamp with time zone NULLABLE
11 updated_at timestamp with time zone NULLABLE
12 nickname text NULLABLE
13 surname text NULLABLE
14 job_title text NULLABLE
15 company text NULLABLE
16 queue_id uuid NULLABLE
17 contact_type text NULLABLE
18 ai_priority text NULLABLE
19 ai_sentiment text NULLABLE
20 channel_type text NULLABLE
21 channel_connection_id uuid NULLABLE
22 group_category text NULLABLE
23 lead_score integer NULLABLE
24 risk_score integer NULLABLE
25 lead_origin text NULLABLE
26 consent_status text NULLABLE
27 avatar_fetch_attempted_at timestamp with time zone NULLABLE
28 conversation_status text NULLABLE
29 conversation_status_changed_at timestamp with time zone NULLABLE
30 is_lid_legacy boolean NULLABLE
31 postal_code text NULLABLE
32 address text NULLABLE
33 address_number text NULLABLE
34 neighborhood text NULLABLE
35 city text NULLABLE
36 state text NULLABLE
37 latitude double precision NULLABLE
38 longitude double precision NULLABLE
39 deleted_at timestamp with time zone NULLABLE
40 ai_projection_updated_at timestamp with time zone NULLABLE
41 ai_projection_analysis_id uuid NULLABLE
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

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
