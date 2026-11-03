# public.whisper_messages

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `sender_id` | `uuid` | não |  |  |  |
| 4 | `target_agent_id` | `uuid` | não |  |  |  |
| 5 | `content` | `text` | não |  |  |  |
| 6 | `is_read` | `boolean` | sim | `false` |  |  |
| 7 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 8 | `audio_path` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| whisper_messages_audio_path_do_remetente | CHECK | `CHECK (audio_path IS NULL OR split_part(audio_path, '/'::text, 2) = contact_id::text)` |  |  | sim |
| whisper_messages_audio_path_formato | CHECK | `CHECK (audio_path IS NULL OR audio_path ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'::text)` |  |  | sim |
| whisper_messages_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id)` | NO ACTION | NO ACTION | sim |
| whisper_messages_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| whisper_messages_sender_id_fkey | FOREIGN KEY | `FOREIGN KEY (sender_id) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| whisper_messages_target_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (target_agent_id) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_whisper_messages_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_whisper_messages_contact_id ON public.whisper_messages USING btree (contact_id)` |
| idx_whisper_messages_sender_id | btree | sender_id | não | sim |  | `CREATE INDEX idx_whisper_messages_sender_id ON public.whisper_messages USING btree (sender_id)` |
| idx_whisper_messages_target_agent_id | btree | target_agent_id | não | sim |  | `CREATE INDEX idx_whisper_messages_target_agent_id ON public.whisper_messages USING btree (target_agent_id)` |
| whisper_messages_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX whisper_messages_pkey ON public.whisper_messages USING btree (id)` |


## Policies (RLS)

### `Users can delete own whisper messages`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Users can insert own whisper messages`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) OR ((sender_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) AND is_contact_visible_to_user(contact_id, auth.uid())))` |

### `Users can mark own whisper messages as read`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(target_agent_id = current_profile_id())` |
| WITH CHECK | `(target_agent_id = current_profile_id())` |

### `Users can view own whisper messages`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((sender_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR (target_agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| whisper_messages_somente_is_read | BEFORE | UPDATE | ROW | enabled | public.whisper_messages_somente_is_read |
| whisper_messages_valida_audio_path | BEFORE | INSERT OR UPDATE | ROW | enabled | public.whisper_messages_valida_audio_path |


## Grants

_nenhum_
