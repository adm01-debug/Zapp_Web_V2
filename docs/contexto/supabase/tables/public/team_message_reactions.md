# public.team_message_reactions

> Emoji reactions on team messages (one per user per emoji per message)

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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `message_id` | `uuid` | não |  |  |  |
| 3 | `profile_id` | `uuid` | não |  |  |  |
| 4 | `emoji` | `text` | não |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `conversation_id` | `uuid` | não |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| team_message_reactions_conversation_id_fkey | FOREIGN KEY | `FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| team_message_reactions_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (message_id) REFERENCES team_messages(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| team_message_reactions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| team_message_reactions_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| team_message_reactions_unique | UNIQUE | `UNIQUE (message_id, profile_id, emoji)` |  |  | sim |
| team_reactions_emoji_length | CHECK | `CHECK (char_length(emoji) >= 1 AND char_length(emoji) <= 8)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_team_message_reactions_conversation_id | btree | conversation_id | não | sim |  | `CREATE INDEX idx_team_message_reactions_conversation_id ON public.team_message_reactions USING btree (conversation_id)` |
| idx_team_message_reactions_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_team_message_reactions_profile_id ON public.team_message_reactions USING btree (profile_id)` |
| team_message_reactions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX team_message_reactions_pkey ON public.team_message_reactions USING btree (id)` |
| team_message_reactions_unique | btree | message_id, profile_id, emoji | sim | sim |  | `CREATE UNIQUE INDEX team_message_reactions_unique ON public.team_message_reactions USING btree (message_id, profile_id, emoji)` |


## Policies (RLS)

### `reactions_delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(profile_id = current_profile_id())` |
| WITH CHECK |  |

### `reactions_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM (team_conversation_members tcm      JOIN team_messages tm ON ((tm.id = team_message_reactions.message_id)))   WHERE ((tcm.conversation_id = tm.conversation_id) AND (tcm.profile_id = current_profile_id()))))` |
| WITH CHECK |  |

### `team_message_reactions_delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM profiles p   WHERE ((p.id = team_message_reactions.profile_id) AND (p.user_id = auth.uid()))))` |
| WITH CHECK |  |

### `team_message_reactions_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((EXISTS ( SELECT 1    FROM profiles p   WHERE ((p.id = team_message_reactions.profile_id) AND (p.user_id = auth.uid())))) AND (EXISTS ( SELECT 1    FROM team_messages tm   WHERE ((tm.id = team_message_reactions.message_id) AND is_team_conversation_member(auth.uid(), tm.conversation_id)))))` |

### `team_message_reactions_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM ((team_messages tm      JOIN team_conversation_members tcm ON ((tcm.conversation_id = tm.conversation_id)))      JOIN profiles p ON ((p.id = tcm.profile_id)))   WHERE ((tm.id = team_message_reactions.message_id) AND (p.user_id = auth.uid()))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| team_reactions_dedup_trig | BEFORE | INSERT | ROW | enabled | public.team_reactions_dedup_guard |
| team_reactions_force_conversation_id_trig | BEFORE | INSERT OR UPDATE | ROW | enabled | public.team_reactions_force_conversation_id |


## Grants

_nenhum_
