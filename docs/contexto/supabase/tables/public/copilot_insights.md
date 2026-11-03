# public.copilot_insights

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


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_insights_insight_type_check | CHECK | `CHECK (insight_type = ANY (ARRAY['suggestion'::text, 'alert'::text, 'next_action'::text, 'objection'::text, 'brinde_field'::text, 'temperature_change'::text, 'stage_change'::text, 'attachment'::text, 'follow_up'::text, 'other'::text]))` |  |  | sim |
| copilot_insights_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| copilot_insights_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES auth.users(id)` | NO ACTION | NO ACTION | sim |
| copilot_insights_session_id_fkey | FOREIGN KEY | `FOREIGN KEY (session_id) REFERENCES copilot_sessions(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| copilot_insights_source_check | CHECK | `CHECK (source = ANY (ARRAY['local'::text, 'edge'::text, 'cache'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_insights_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_insights_pkey ON public.copilot_insights USING btree (id)` |
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
| USING | `(profile_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
