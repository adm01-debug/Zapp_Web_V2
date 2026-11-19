# public.copilot_feedback

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `conversation_id` | `uuid` | não |  |  |  |
| 3 | `contact_id` | `uuid` | não |  |  |  |
| 4 | `feedback_type` | `text` | não |  |  |  |
| 5 | `edit_level` | `text` | sim |  |  |  |
| 6 | `suggestion_text` | `text` | sim |  |  |  |
| 7 | `sent_text` | `text` | sim |  |  |  |
| 8 | `suggestion_id` | `text` | sim |  |  |  |
| 9 | `rating` | `text` | sim |  |  |  |
| 10 | `reason` | `text` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `created_by` | `uuid` | sim | `auth.uid()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_feedback_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES auth.users(id)` | NO ACTION | NO ACTION | sim |
| copilot_feedback_edit_level_check | CHECK | `CHECK (edit_level = ANY (ARRAY['igual'::text, 'pouco'::text, 'muito'::text]))` |  |  | sim |
| copilot_feedback_feedback_type_check | CHECK | `CHECK (feedback_type = ANY (ARRAY['edit_distance'::text, 'thumbs'::text]))` |  |  | sim |
| copilot_feedback_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| copilot_feedback_rating_check | CHECK | `CHECK (rating = ANY (ARRAY['positive'::text, 'negative'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_feedback_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_feedback_pkey ON public.copilot_feedback USING btree (id)` |
| idx_copilot_feedback_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_copilot_feedback_created_by ON public.copilot_feedback USING btree (created_by)` |


## Policies (RLS)

### `copilot_feedback_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(created_by = auth.uid())` |

### `copilot_feedback_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(created_by = auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
