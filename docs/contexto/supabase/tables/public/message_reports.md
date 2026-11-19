# public.message_reports

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
| 2 | `message_id` | `uuid` | não |  |  |  |
| 3 | `reporter_id` | `uuid` | não |  |  |  |
| 4 | `reason` | `text` | não |  |  |  |
| 5 | `note` | `text` | sim |  |  |  |
| 6 | `status` | `text` | não | `'open'::text` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `resolved_by` | `uuid` | sim |  |  |  |
| 9 | `resolved_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| message_reports_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| message_reports_message_id_reporter_id_key | UNIQUE | `UNIQUE (message_id, reporter_id)` |  |  | sim |
| message_reports_note_check | CHECK | `CHECK (note IS NULL OR char_length(note) >= 1 AND char_length(note) <= 500)` |  |  | sim |
| message_reports_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| message_reports_reason_check | CHECK | `CHECK (reason = ANY (ARRAY['spam'::text, 'improprio'::text, 'urgencia'::text, 'outro'::text]))` |  |  | sim |
| message_reports_reporter_id_fkey | FOREIGN KEY | `FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| message_reports_resolved_by_fkey | FOREIGN KEY | `FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| message_reports_status_check | CHECK | `CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text, 'dismissed'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_message_reports_resolved_by | btree | resolved_by | não | sim |  | `CREATE INDEX idx_message_reports_resolved_by ON public.message_reports USING btree (resolved_by)` |
| message_reports_message_id_reporter_id_key | btree | message_id, reporter_id | sim | sim |  | `CREATE UNIQUE INDEX message_reports_message_id_reporter_id_key ON public.message_reports USING btree (message_id, reporter_id)` |
| message_reports_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX message_reports_pkey ON public.message_reports USING btree (id)` |


## Policies (RLS)

### `message_reports_select_own_or_admin`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((reporter_id = ( SELECT auth.uid() AS uid)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `message_reports_update_admin`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) AND ((status = 'open'::text) OR (resolved_by = ( SELECT auth.uid() AS uid))))` |


## Triggers

_nenhum_


## Grants

_nenhum_
