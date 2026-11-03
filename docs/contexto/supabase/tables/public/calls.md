# public.calls

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | sim |  |  |  |
| 3 | `agent_id` | `uuid` | sim |  |  |  |
| 4 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 5 | `direction` | `text` | não |  |  |  |
| 6 | `status` | `text` | não | `'ringing'::text` |  |  |
| 7 | `started_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `answered_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `ended_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `duration_seconds` | `integer` | sim |  |  |  |
| 11 | `recording_url` | `text` | sim |  |  |  |
| 12 | `notes` | `text` | sim |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `provider_event_id` | `text` | sim |  |  |  |
| 15 | `channel` | `text` | sim |  |  |  |
| 16 | `provider_call_id` | `text` | sim |  |  |  |
| 17 | `peer_number` | `text` | sim |  |  |  |
| 18 | `peer_name` | `text` | sim |  |  |  |
| 19 | `answered_by` | `uuid` | sim |  |  |  |
| 20 | `end_reason` | `text` | sim |  |  |  |
| 21 | `agent_notes` | `text` | sim |  |  |  |
| 22 | `recording_status` | `text` | não | `'none'::text` |  |  |
| 23 | `talk_seconds` | `integer` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| calls_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| calls_answered_by_fkey | FOREIGN KEY | `FOREIGN KEY (answered_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| calls_channel_check | CHECK | `CHECK (channel IS NULL OR (channel = ANY (ARRAY['voip'::text, 'whatsapp'::text])))` |  |  | sim |
| calls_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| calls_direction_check | CHECK | `CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))` |  |  | sim |
| calls_end_reason_check | CHECK | `CHECK (end_reason IS NULL OR (end_reason = ANY (ARRAY['completed'::text, 'hangup_local'::text, 'hangup_remote'::text, 'no_answer'::text, 'busy'::text, 'busy_here'::text, 'cancelled'::text, 'cancelled_remote'::text, 'declined'::text, 'failed'::text, 'timeout'::text])))` |  |  | sim |
| calls_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| calls_provider_event_id_length | CHECK | `CHECK (provider_event_id IS NULL OR char_length(provider_event_id) >= 1 AND char_length(provider_event_id) <= 200)` |  |  | sim |
| calls_recording_status_check | CHECK | `CHECK (recording_status = ANY (ARRAY['none'::text, 'pending'::text, 'available'::text, 'failed'::text]))` |  |  | sim |
| calls_status_check | CHECK | `CHECK (status = ANY (ARRAY['ringing'::text, 'answered'::text, 'ended'::text, 'missed'::text, 'busy'::text, 'failed'::text, 'cancelled'::text, 'declined'::text]))` |  |  | sim |
| calls_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| calls_agent_started_idx | btree | agent_id, started_at, id | não | sim |  | `CREATE INDEX calls_agent_started_idx ON public.calls USING btree (agent_id, started_at DESC, id DESC)` |
| calls_channel_provider_call_unique | btree | channel, provider_call_id | sim | sim | `(provider_call_id IS NOT NULL)` | `CREATE UNIQUE INDEX calls_channel_provider_call_unique ON public.calls USING btree (channel, provider_call_id) WHERE (provider_call_id IS NOT NULL)` |
| calls_connection_provider_event_unique | btree | whatsapp_connection_id, provider_event_id | sim | sim | `(provider_event_id IS NOT NULL)` | `CREATE UNIQUE INDEX calls_connection_provider_event_unique ON public.calls USING btree (whatsapp_connection_id, provider_event_id) WHERE (provider_event_id IS NOT NULL)` |
| calls_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX calls_pkey ON public.calls USING btree (id)` |
| idx_calls_agent_id | btree | agent_id | não | sim |  | `CREATE INDEX idx_calls_agent_id ON public.calls USING btree (agent_id)` |
| idx_calls_answered_by | btree | answered_by | não | sim | `(answered_by IS NOT NULL)` | `CREATE INDEX idx_calls_answered_by ON public.calls USING btree (answered_by) WHERE (answered_by IS NOT NULL)` |
| idx_calls_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_calls_contact_id ON public.calls USING btree (contact_id)` |
| idx_calls_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_calls_whatsapp_connection_id ON public.calls USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Users can insert calls`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((agent_id = get_profile_id_for_user(auth.uid())) AND (is_admin_or_supervisor(auth.uid()) OR (contact_id IS NULL) OR is_contact_visible_to_user(contact_id, auth.uid())))` |

### `Users can update their calls`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |
| WITH CHECK | `(agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |

### `Users can view own calls`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_prevent_call_contact_redirect | BEFORE | UPDATE | ROW | enabled | public.prevent_call_contact_redirect |


## Grants

_nenhum_
