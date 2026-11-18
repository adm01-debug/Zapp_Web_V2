# public.team_messages

> Messages within a team conversation

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |
| usada por views | public.team_message_read_state |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `conversation_id` | `uuid` | não |  |  |  |
| 3 | `sender_id` | `uuid` | não |  |  | References profiles.id (NOT auth.uid) |
| 4 | `content` | `text` | não |  |  |  |
| 5 | `message_type` | `text` | não | `'text'::text` |  |  |
| 6 | `reply_to_id` | `uuid` | sim |  |  |  |
| 7 | `is_edited` | `boolean` | não | `false` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `media_url` | `text` | sim |  |  | URL temporária; prefer media_bucket+media_path para acesso persistente |
| 11 | `media_type` | `text` | sim |  |  |  |
| 12 | `status` | `text` | não | `'sent'::text` |  |  |
| 13 | `media_bucket` | `text` | sim |  |  |  |
| 14 | `media_path` | `text` | sim |  |  |  |
| 15 | `metadata` | `jsonb` | sim | `'{}'::jsonb` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| team_messages_content_not_empty | CHECK | `CHECK (TRIM(BOTH FROM content) <> ''::text OR media_url IS NOT NULL OR media_type IS NOT NULL AND media_bucket IS NOT NULL AND media_path IS NOT NULL)` |  |  | sim |
| team_messages_conversation_id_fkey | FOREIGN KEY | `FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| team_messages_media_consistency | CHECK | `CHECK (media_bucket IS NULL AND media_path IS NULL AND (media_url IS NULL) = (media_type IS NULL) OR media_type IS NOT NULL AND media_bucket IS NOT NULL AND media_path IS NOT NULL)` |  |  | sim |
| team_messages_media_path_matches_sender_conversation | CHECK | `CHECK (media_bucket IS DISTINCT FROM 'team-chat-files'::text OR media_path IS NOT NULL AND split_part(media_path, '/'::text, 1) = sender_id::text AND split_part(media_path, '/'::text, 2) = conversation_id::text AND split_part(media_path, '/'::text, 3) <> ''::text)` |  |  | sim |
| team_messages_message_type_check | CHECK | `CHECK (message_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'document'::text, 'system'::text]))` |  |  | sim |
| team_messages_no_self_reply | CHECK | `CHECK (reply_to_id IS NULL OR reply_to_id <> id)` |  |  | sim |
| team_messages_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| team_messages_reply_to_id_fkey | FOREIGN KEY | `FOREIGN KEY (reply_to_id) REFERENCES team_messages(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| team_messages_sender_id_fkey | FOREIGN KEY | `FOREIGN KEY (sender_id) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| team_messages_status_check | CHECK | `CHECK (status = ANY (ARRAY['sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]))` |  |  | sim |
| team_messages_type_media_check | CHECK | `CHECK ((message_type = ANY (ARRAY['text'::text, 'image'::text, 'audio'::text, 'video'::text, 'file'::text, 'sticker'::text, 'system'::text])) OR media_url IS NULL)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.team_message_reactions | team_message_reactions_message_id_fkey | message_id | CASCADE |
| public.team_message_receipts | team_message_receipts_message_id_fkey | message_id | CASCADE |
| public.team_messages | team_messages_reply_to_id_fkey | reply_to_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_team_messages_content_trgm | gin | content | não | sim |  | `CREATE INDEX idx_team_messages_content_trgm ON public.team_messages USING gin (content extensions.gin_trgm_ops)` |
| idx_team_messages_conv_created | btree | conversation_id, created_at | não | sim |  | `CREATE INDEX idx_team_messages_conv_created ON public.team_messages USING btree (conversation_id, created_at DESC)` |
| idx_team_messages_reply_to | btree | reply_to_id | não | sim | `(reply_to_id IS NOT NULL)` | `CREATE INDEX idx_team_messages_reply_to ON public.team_messages USING btree (reply_to_id) WHERE (reply_to_id IS NOT NULL)` |
| idx_team_messages_sender_id | btree | sender_id | não | sim |  | `CREATE INDEX idx_team_messages_sender_id ON public.team_messages USING btree (sender_id)` |
| team_messages_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX team_messages_pkey ON public.team_messages USING btree (id)` |


## Policies (RLS)

### `Members can send messages`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_team_conversation_member(auth.uid(), conversation_id) AND (sender_id = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = auth.uid())  LIMIT 1)))` |

### `Members can view conversation messages`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_team_conversation_member(auth.uid(), conversation_id)` |
| WITH CHECK |  |

### `Senders can delete own messages`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(sender_id = ( SELECT p.id    FROM profiles p   WHERE (p.user_id = auth.uid())  LIMIT 1))` |
| WITH CHECK |  |

### `team_messages_update_own`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(sender_id = current_profile_id())` |
| WITH CHECK | `(sender_id = current_profile_id())` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| after_team_message_insert_bump_conversation | AFTER | INSERT | ROW | enabled | public.bump_conversation_updated_at |
| team_messages_edit_guard_trig | BEFORE | UPDATE | ROW | enabled | public.team_messages_edit_guard |
| team_messages_validate_reply_to_trig | BEFORE | INSERT OR UPDATE | ROW | enabled | public.team_messages_validate_reply_to |
| update_team_messages_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
