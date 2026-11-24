# public.copilot_insights

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.copilot_insights (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 session_id uuid NOT NULL
3 profile_id uuid NOT NULL
4 insight_type text NOT NULL
5 content text NOT NULL
6 source text NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 model_version text NULLABLE
8 state_version integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 shown_at timestamp with time zone NULLABLE
10 used_at timestamp with time zone NULLABLE
11 dismissed_at timestamp with time zone NULLABLE
12 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
13 tier smallint NOT NULL [DEFAULT/EXPRESSION DEFINED]
14 latency_ms integer NULLABLE
15 data jsonb NULLABLE
Constraints:
copilot_insights_insight_type_check: CHECK (insight_type = ANY (ARRAY['suggestion'::text, 'alert'::text, 'next_action'::text, 'objection'::text, 'brinde_field'::text, 'temperature_change'::text, 'stage_change'::text, 'attachment'::text, 'follow_up'::text, 'other'::text]))
copilot_insights_source_check: CHECK (source = ANY (ARRAY['local'::text, 'edge'::text, 'cache'::text]))
copilot_insights_tier_check: CHECK (tier = ANY (ARRAY[1, 2]))
copilot_insights_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES auth.users(id)
copilot_insights_session_id_fkey: FOREIGN KEY (session_id) REFERENCES copilot_sessions(id) ON DELETE CASCADE
copilot_insights_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
service_role_insights [command=ALL; roles=service_role; PERMISSIVE]
vendor_own_insights [command=ALL; roles=PUBLIC; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `session_id` | `uuid` | não |  |  |  |
| 3 | `profile_id` | `uuid` | não |  |  |  |
| 4 | `insight_type` | `text` | não |  |  |  |
| 5 | `content` | `text` | não |  |  |  |
| 6 | `source` | `text` | não | `'local'::text` |  |  |
| 7 | `model_version` | `text` | sim |  |  |  |
| 8 | `state_version` | `integer` | não | `1` |  |  |
| 9 | `shown_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `used_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `dismissed_at` | `timestamp with time zone` | sim |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `tier` | `smallint` | não | `1` |  |  |
| 14 | `latency_ms` | `integer` | sim |  |  |  |
| 15 | `data` | `jsonb` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_insights_insight_type_check | CHECK | `CHECK (insight_type = ANY (ARRAY['suggestion'::text, 'alert'::text, 'next_action'::text, 'objection'::text, 'brinde_field'::text, 'temperature_change'::text, 'stage_change'::text, 'attachment'::text, 'follow_up'::text, 'other'::text]))` |  |  | sim |
| copilot_insights_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| copilot_insights_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES auth.users(id)` | NO ACTION | NO ACTION | sim |
| copilot_insights_session_id_fkey | FOREIGN KEY | `FOREIGN KEY (session_id) REFERENCES copilot_sessions(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| copilot_insights_source_check | CHECK | `CHECK (source = ANY (ARRAY['local'::text, 'edge'::text, 'cache'::text]))` |  |  | sim |
| copilot_insights_tier_check | CHECK | `CHECK (tier = ANY (ARRAY[1, 2]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_insights_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_insights_pkey ON public.copilot_insights USING btree (id)` |
| idx_copilot_insights_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_copilot_insights_created_at ON public.copilot_insights USING btree (created_at)` |
| idx_copilot_insights_profile | btree | profile_id | não | sim |  | `CREATE INDEX idx_copilot_insights_profile ON public.copilot_insights USING btree (profile_id)` |
| idx_copilot_insights_session_time | btree | session_id, created_at | não | sim |  | `CREATE INDEX idx_copilot_insights_session_time ON public.copilot_insights USING btree (session_id, created_at DESC)` |


## Policies (RLS)

### `service_role_insights`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | service_role |
| USING | `true` |
| WITH CHECK | `true` |

### `vendor_own_insights`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | public |
| USING | `(profile_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
