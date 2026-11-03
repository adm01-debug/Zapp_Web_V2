# public.messages

> Mensagens de todas as origens. O trigger trg_sicoob_reply (Sicoob Bridge) foi removido em 29/09/2026.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | sim |  |  |  |
| 3 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 4 | `sender` | `text` | não |  |  |  |
| 5 | `content` | `text` | não |  |  |  |
| 6 | `message_type` | `text` | não | `'text'::text` |  |  |
| 7 | `media_url` | `text` | sim |  |  |  |
| 8 | `is_read` | `boolean` | sim | `false` |  |  |
| 9 | `agent_id` | `uuid` | sim |  |  |  |
| 10 | `external_id` | `text` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `transcription` | `text` | sim |  |  |  |
| 14 | `transcription_status` | `text` | sim | `'pending'::text` |  |  |
| 15 | `status` | `text` | sim | `'sent'::text` |  |  |
| 16 | `status_updated_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 17 | `is_deleted` | `boolean` | sim | `false` |  |  |
| 18 | `channel_type` | `text` | sim | `'whatsapp'::text` |  |  |
| 19 | `channel_connection_id` | `uuid` | sim |  |  |  |
| 20 | `is_edited` | `boolean` | não | `false` |  |  |
| 21 | `ptt` | `boolean` | sim |  |  |  |
| 22 | `audio_meme_id` | `uuid` | sim |  |  |  |
| 23 | `media_type` | `text` | sim |  |  |  |
| 24 | `media_mimetype` | `text` | sim |  |  |  |
| 25 | `media_filename` | `text` | sim |  |  |  |
| 26 | `media_size` | `bigint` | sim |  |  |  |
| 27 | `media_meta` | `jsonb` | sim |  |  |  |
| 28 | `caption` | `text` | sim |  |  |  |
| 29 | `link_preview` | `jsonb` | sim |  |  |  |
| 30 | `reply_to_id` | `uuid` | sim |  |  |  |
| 31 | `client_message_id` | `uuid` | sim |  |  | Idempotency key supplied by the client; unique within contact_id. |
| 32 | `delivery_claim_token` | `uuid` | sim |  |  |  |
| 33 | `delivery_claimed_at` | `timestamp with time zone` | sim |  |  |  |
| 34 | `delivery_claim_expires_at` | `timestamp with time zone` | sim |  |  |  |
| 35 | `delivery_claimed_by` | `text` | sim |  |  |  |
| 36 | `delivery_last_claim_token` | `uuid` | sim |  |  |  |
| 37 | `delivery_attempt_count` | `integer` | não | `0` |  |  |
| 38 | `transcribed_at` | `timestamp with time zone` | sim |  |  |  |
| 39 | `sender_participant_jid` | `text` | sim |  |  |  |
| 40 | `sender_display_name` | `text` | sim |  |  |  |
| 41 | `whatsapp_group_id` | `uuid` | sim |  |  | Destino de grupo da fila de envio (whatsapp_groups.id). Mutuamente exclusivo com contact_id em mensagens novas; NULL nas mensagens de contato e no historico. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| messages_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| messages_audio_meme_id_fkey | FOREIGN KEY | `FOREIGN KEY (audio_meme_id) REFERENCES audio_memes(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| messages_channel_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id)` | NO ACTION | NO ACTION | sim |
| messages_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| messages_delivery_attempt_count_nonnegative | CHECK | `CHECK (delivery_attempt_count >= 0)` |  |  | sim |
| messages_delivery_claim_state | CHECK | `CHECK (delivery_claim_token IS NULL AND delivery_claimed_at IS NULL AND delivery_claim_expires_at IS NULL AND delivery_claimed_by IS NULL OR delivery_claim_token IS NOT NULL AND delivery_claimed_at IS NOT NULL AND delivery_claim_expires_at IS NOT NULL AND delivery_claimed_by IS NOT NULL AND delivery_claim_expires_at > delivery_claimed_at AND length(delivery_claimed_by) >= 1 AND length(delivery_claimed_by) <= 100)` |  |  | sim |
| messages_message_type_check | CHECK | `CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'document'::text, 'sticker'::text, 'location'::text, 'contact'::text, 'poll'::text, 'button'::text, 'list'::text, 'reaction'::text, 'vcard'::text, 'ptt'::text, 'link'::text, 'template'::text, 'interactive'::text, 'order'::text, 'product'::text, 'catalog'::text, 'buttons'::text]))` |  |  | sim |
| messages_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| messages_reply_to_id_fkey | FOREIGN KEY | `FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| messages_sender_check | CHECK | `CHECK (sender = ANY (ARRAY['agent'::text, 'contact'::text]))` |  |  | sim |
| messages_single_outbound_destination_chk | CHECK | `CHECK (NOT (contact_id IS NOT NULL AND whatsapp_group_id IS NOT NULL))` |  |  | sim |
| messages_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| messages_whatsapp_group_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_group_id) REFERENCES whatsapp_groups(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.message_attempts | message_attempts_message_id_fkey | message_id | CASCADE |
| public.message_favorites | message_favorites_message_id_fkey | message_id | CASCADE |
| public.message_pins | message_pins_message_id_fkey | message_id | CASCADE |
| public.message_reactions | message_reactions_message_id_fkey | message_id | CASCADE |
| public.message_reports | message_reports_message_id_fkey | message_id | CASCADE |
| public.messages | messages_reply_to_id_fkey | reply_to_id | SET NULL |
| public.talkx_blacklist | talkx_blacklist_source_message_id_fkey | source_message_id | SET NULL |
| public.talkx_recipients | talkx_recipients_reply_message_id_fkey | reply_message_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_messages_agent_id | btree | agent_id | não | sim |  | `CREATE INDEX idx_messages_agent_id ON public.messages USING btree (agent_id)` |
| idx_messages_audio_meme_id | btree | audio_meme_id | não | sim | `(audio_meme_id IS NOT NULL)` | `CREATE INDEX idx_messages_audio_meme_id ON public.messages USING btree (audio_meme_id) WHERE (audio_meme_id IS NOT NULL)` |
| idx_messages_channel_connection_id | btree | channel_connection_id | não | sim | `(channel_connection_id IS NOT NULL)` | `CREATE INDEX idx_messages_channel_connection_id ON public.messages USING btree (channel_connection_id) WHERE (channel_connection_id IS NOT NULL)` |
| idx_messages_contact_created | btree | contact_id, created_at | não | sim |  | `CREATE INDEX idx_messages_contact_created ON public.messages USING btree (contact_id, created_at DESC)` |
| idx_messages_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_messages_contact_id ON public.messages USING btree (contact_id)` |
| idx_messages_contact_media | btree | contact_id, created_at | não | sim | `(media_url IS NOT NULL)` | `CREATE INDEX idx_messages_contact_media ON public.messages USING btree (contact_id, created_at DESC) WHERE (media_url IS NOT NULL)` |
| idx_messages_contact_read_sender | btree | contact_id, is_read, sender | não | sim |  | `CREATE INDEX idx_messages_contact_read_sender ON public.messages USING btree (contact_id, is_read, sender)` |
| idx_messages_content_trgm | gin | content | não | sim |  | `CREATE INDEX idx_messages_content_trgm ON public.messages USING gin (content extensions.gin_trgm_ops)` |
| idx_messages_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_messages_created_at ON public.messages USING btree (created_at DESC)` |
| idx_messages_delivery_claimable | btree | created_at, id | não | sim | `((sender = 'agent'::text) AND (status = 'sending'::text) AND (external_id IS NULL))` | `CREATE INDEX idx_messages_delivery_claimable ON public.messages USING btree (created_at, id) WHERE ((sender = 'agent'::text) AND (status = 'sending'::text) AND (external_id IS NULL))` |
| idx_messages_media_url_trgm | gin | media_url | não | sim | `(media_url IS NOT NULL)` | `CREATE INDEX idx_messages_media_url_trgm ON public.messages USING gin (media_url extensions.gin_trgm_ops) WHERE (media_url IS NOT NULL)` |
| idx_messages_read_sender | btree | is_read, sender | não | sim |  | `CREATE INDEX idx_messages_read_sender ON public.messages USING btree (is_read, sender)` |
| idx_messages_reply_to | btree | reply_to_id | não | sim | `(reply_to_id IS NOT NULL)` | `CREATE INDEX idx_messages_reply_to ON public.messages USING btree (reply_to_id) WHERE (reply_to_id IS NOT NULL)` |
| idx_messages_sender_created_at | btree | sender, created_at | não | sim |  | `CREATE INDEX idx_messages_sender_created_at ON public.messages USING btree (sender, created_at DESC)` |
| idx_messages_transcription_trgm | gin | transcription | não | sim |  | `CREATE INDEX idx_messages_transcription_trgm ON public.messages USING gin (transcription extensions.gin_trgm_ops)` |
| idx_messages_unread_contact | btree | is_read, sender, contact_id | não | sim | `((is_read = false) AND (sender = 'contact'::text))` | `CREATE INDEX idx_messages_unread_contact ON public.messages USING btree (is_read, sender, contact_id) WHERE ((is_read = false) AND (sender = 'contact'::text))` |
| idx_messages_unread_conversas | btree | contact_id | não | sim | `((sender = 'contact'::text) AND (is_read IS NOT TRUE))` | `CREATE INDEX idx_messages_unread_conversas ON public.messages USING btree (contact_id) WHERE ((sender = 'contact'::text) AND (is_read IS NOT TRUE))` |
| idx_messages_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_messages_whatsapp_connection_id ON public.messages USING btree (whatsapp_connection_id)` |
| messages_external_id_uq | btree | external_id | sim | sim | `(external_id IS NOT NULL)` | `CREATE UNIQUE INDEX messages_external_id_uq ON public.messages USING btree (external_id) WHERE (external_id IS NOT NULL)` |
| messages_group_client_msg_uq | btree | whatsapp_group_id, client_message_id | sim | sim | `((client_message_id IS NOT NULL) AND (whatsapp_group_id IS NOT NULL))` | `CREATE UNIQUE INDEX messages_group_client_msg_uq ON public.messages USING btree (whatsapp_group_id, client_message_id) WHERE ((client_message_id IS NOT NULL) AND (whatsapp_group_id IS NOT NULL))` |
| messages_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id)` |
| messages_whatsapp_group_id_idx | btree | whatsapp_group_id | não | sim | `(whatsapp_group_id IS NOT NULL)` | `CREATE INDEX messages_whatsapp_group_id_idx ON public.messages USING btree (whatsapp_group_id) WHERE (whatsapp_group_id IS NOT NULL)` |
| ux_messages_contact_client_message_id | btree | contact_id, client_message_id | sim | sim | `(client_message_id IS NOT NULL)` | `CREATE UNIQUE INDEX ux_messages_contact_client_message_id ON public.messages USING btree (contact_id, client_message_id) WHERE (client_message_id IS NOT NULL)` |
| ux_messages_dedup | btree | whatsapp_connection_id, external_id, sender | sim | sim |  | `CREATE UNIQUE INDEX ux_messages_dedup ON public.messages USING btree (whatsapp_connection_id, external_id, sender)` |


## Policies (RLS)

### `Users can insert messages`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_privileged_contact_caller() OR ((sender = 'agent'::text) AND (is_admin_or_supervisor(auth.uid()) OR (((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))) AND ((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR (EXISTS ( SELECT 1    FROM (contacts c      JOIN queue_members qm ON ((qm.queue_id = c.queue_id)))   WHERE ((c.id = messages.contact_id) AND (qm.profile_id = get_profile_id_for_user(auth.uid())) AND (qm.is_active = true)))))))))` |

### `Users can update messages from their assigned contacts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR is_admin_or_supervisor(auth.uid()) OR (EXISTS ( SELECT 1    FROM (contacts c      JOIN queue_members qm ON ((qm.queue_id = c.queue_id)))   WHERE ((c.id = messages.contact_id) AND (qm.profile_id = get_profile_id_for_user(auth.uid())) AND (qm.is_active = true)))))` |
| WITH CHECK | `(is_privileged_contact_caller() OR ((NOT (sender IS DISTINCT FROM message_sender_atual(id))) AND ((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR is_admin_or_supervisor(auth.uid()) OR (EXISTS ( SELECT 1    FROM (contacts c      JOIN queue_members qm ON ((qm.queue_id = c.queue_id)))   WHERE ((c.id = messages.contact_id) AND (qm.profile_id = get_profile_id_for_user(auth.uid())) AND (qm.is_active = true)))))))` |

### `messages_select_policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR (contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))) OR (EXISTS ( SELECT 1    FROM (contacts c      JOIN queue_members qm ON ((qm.queue_id = c.queue_id)))   WHERE ((c.id = messages.contact_id) AND (qm.profile_id = get_profile_id_for_user(auth.uid())) AND (qm.is_active = true)))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_conversation_reopen_on_inbound | AFTER | INSERT | ROW | enabled | public.handle_inbound_message_reopen |
| trg_gamification_on_message_sent | AFTER | INSERT OR UPDATE | ROW | enabled | public.handle_message_gamification |
| trg_guard_message_delivery_internal_fields | BEFORE | INSERT OR UPDATE | ROW | enabled | public.guard_message_delivery_internal_fields |
| trg_guard_message_immutable_columns | BEFORE | UPDATE | ROW | enabled | public.guard_message_immutable_columns |
| trg_guard_message_provenance_fields | BEFORE | INSERT OR UPDATE | ROW | enabled | public.guard_message_provenance_fields |
| trg_messages_sla_first_response | AFTER | INSERT OR UPDATE | ROW | enabled | public.messages_sla_first_response_trigger |
| trg_messages_stamp_transcribed_at | BEFORE | UPDATE | ROW | enabled | public.stamp_message_transcribed_at |
| update_messages_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
