# public.search_events

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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `term_length` | `integer` | não |  |  |  |
| 4 | `had_results` | `boolean` | não |  |  |  |
| 5 | `result_kind` | `text` | sim |  |  |  |
| 6 | `clicked` | `boolean` | não | `false` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `client_event_id` | `uuid` | não | `gen_random_uuid()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| search_events_click_kind_coherence | CHECK | `CHECK (clicked = (result_kind IS NOT NULL))` |  |  | sim |
| search_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| search_events_result_kind_valid | CHECK | `CHECK (result_kind IS NULL OR (result_kind = ANY (ARRAY['message'::text, 'contact'::text, 'transcription'::text, 'action'::text, 'crm'::text, 'other'::text])))` |  |  | sim |
| search_events_term_length_range | CHECK | `CHECK (term_length >= 1 AND term_length <= 200)` |  |  | sim |
| search_events_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_search_events_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_search_events_user_id ON public.search_events USING btree (user_id)` |
| search_events_created_at_idx | btree | created_at | não | sim |  | `CREATE INDEX search_events_created_at_idx ON public.search_events USING btree (created_at)` |
| search_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX search_events_pkey ON public.search_events USING btree (id)` |
| search_events_user_event_id_key | btree | user_id, client_event_id | sim | sim |  | `CREATE UNIQUE INDEX search_events_user_event_id_key ON public.search_events USING btree (user_id, client_event_id)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
