# public.talkx_campaign_segments

> Talk X (X057): segmentos de uma campanha, em ordem (position 1..10). A ordem define qual segmento "ganha" quando o mesmo contato aparece em mais de um.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `campaign_id` | `uuid` | não |  |  |  |
| 2 | `segment_id` | `uuid` | não |  |  |  |
| 3 | `position` | `smallint` | não |  |  |  |
| 4 | `status` | `text` | não | `'pending'::text` |  |  |
| 5 | `paused_at` | `timestamp with time zone` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_campaign_segments_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_campaign_segments_campaign_position_key | UNIQUE | `UNIQUE (campaign_id, "position")` |  |  | sim |
| talkx_campaign_segments_pkey | PRIMARY KEY | `PRIMARY KEY (campaign_id, segment_id)` |  |  | sim |
| talkx_campaign_segments_position_check | CHECK | `CHECK ("position" >= 1 AND "position" <= 10)` |  |  | sim |
| talkx_campaign_segments_segment_id_fkey | FOREIGN KEY | `FOREIGN KEY (segment_id) REFERENCES talkx_segments(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_campaign_segments_status_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'sending'::text, 'paused'::text, 'done'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_campaign_segments_campaign_position_key | btree | campaign_id, position | sim | sim |  | `CREATE UNIQUE INDEX talkx_campaign_segments_campaign_position_key ON public.talkx_campaign_segments USING btree (campaign_id, "position")` |
| talkx_campaign_segments_pkey | btree | campaign_id, segment_id | sim | sim |  | `CREATE UNIQUE INDEX talkx_campaign_segments_pkey ON public.talkx_campaign_segments USING btree (campaign_id, segment_id)` |


## Policies (RLS)

### `Admins can view all campaign segments`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | public |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Users can create campaign segments`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | public |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) AND (EXISTS ( SELECT 1    FROM talkx_campaigns c   WHERE ((c.id = talkx_campaign_segments.campaign_id) AND (c.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1))))))` |

### `Users can delete own draft campaign segments`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | public |
| USING | `(EXISTS ( SELECT 1    FROM talkx_campaigns c   WHERE ((c.id = talkx_campaign_segments.campaign_id) AND (c.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1)) AND is_admin_or_supervisor(auth.uid()) AND (c.status = 'draft'::text))))` |
| WITH CHECK |  |

### `Users can update own campaign segments`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | public |
| USING | `(EXISTS ( SELECT 1    FROM talkx_campaigns c   WHERE ((c.id = talkx_campaign_segments.campaign_id) AND (c.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1)) AND is_admin_or_supervisor(auth.uid()))))` |
| WITH CHECK |  |

### `Users can view own campaign segments`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | public |
| USING | `(EXISTS ( SELECT 1    FROM talkx_campaigns c   WHERE ((c.id = talkx_campaign_segments.campaign_id) AND (c.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1)))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
