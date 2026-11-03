# public.talkx_campaign_events

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
| 2 | `campaign_id` | `uuid` | sim |  |  |  |
| 3 | `event_type` | `text` | não |  |  |  |
| 4 | `message` | `text` | sim |  |  |  |
| 5 | `actor_id` | `uuid` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `entity_type` | `text` | sim |  |  |  |
| 8 | `entity_id` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_campaign_events_actor_id_fkey | FOREIGN KEY | `FOREIGN KEY (actor_id) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaign_events_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_campaign_events_entity_type_format_check | CHECK | `CHECK (entity_type IS NULL OR entity_type ~ '^[a-z][a-z0-9_.]{1,40}$'::text)` |  |  | sim |
| talkx_campaign_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_campaign_events_target_check | CHECK | `CHECK ((campaign_id IS NOT NULL) <> (entity_type IS NOT NULL AND entity_id IS NOT NULL))` |  |  | sim |
| talkx_campaign_events_type_check | CHECK | `CHECK (event_type = ANY (ARRAY['created'::text, 'updated'::text, 'scheduled'::text, 'started'::text, 'paused'::text, 'resumed'::text, 'cancelled'::text, 'completed'::text, 'note'::text, 'scheduled_updated'::text, 'limits_updated'::text, 'connection_failed'::text, 'resumed_auto'::text, 'skipped_suppressed'::text, 'suppression_add'::text, 'suppression_remove'::text, 'suppression_update'::text, 'segments_reviewed'::text, 'checklist'::text, 'link_created'::text, 'link_updated'::text, 'link_deleted'::text, 'investment_updated'::text, 'report_exported'::text, 'report_shared'::text, 'import_created'::text, 'import_completed'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_campaign_events_actor_id | btree | actor_id | não | sim |  | `CREATE INDEX idx_talkx_campaign_events_actor_id ON public.talkx_campaign_events USING btree (actor_id)` |
| idx_talkx_campaign_events_campaign_created | btree | campaign_id, created_at | não | sim |  | `CREATE INDEX idx_talkx_campaign_events_campaign_created ON public.talkx_campaign_events USING btree (campaign_id, created_at DESC)` |
| idx_talkx_campaign_events_campaign_id | btree | campaign_id | não | sim |  | `CREATE INDEX idx_talkx_campaign_events_campaign_id ON public.talkx_campaign_events USING btree (campaign_id)` |
| talkx_campaign_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_campaign_events_pkey ON public.talkx_campaign_events USING btree (id)` |


## Policies (RLS)

### `talkx_campaign_events_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((event_type = ANY (ARRAY['note'::text, 'checklist'::text, 'segments_reviewed'::text])) AND ((EXISTS ( SELECT 1    FROM talkx_campaigns tc   WHERE ((tc.id = talkx_campaign_events.campaign_id) AND ((tc.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1)) OR is_admin_or_supervisor(auth.uid()))))) OR ((campaign_id IS NULL) AND is_admin_or_supervisor(auth.uid()))))` |

### `talkx_campaign_events_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((EXISTS ( SELECT 1    FROM talkx_campaigns tc   WHERE ((tc.id = talkx_campaign_events.campaign_id) AND ((tc.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1)) OR is_admin_or_supervisor(auth.uid()))))) OR ((campaign_id IS NULL) AND is_admin_or_supervisor(auth.uid())))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
