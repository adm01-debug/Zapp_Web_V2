# public.team_conversation_members

> Members of a team conversation with read/mute state

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
| 3 | `profile_id` | `uuid` | não |  |  |  |
| 4 | `joined_at` | `timestamp with time zone` | não | `now()` |  |  |
| 5 | `last_read_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 6 | `is_muted` | `boolean` | sim | `false` |  |  |
| 7 | `is_pinned` | `boolean` | não | `false` |  |  |
| 8 | `is_archived` | `boolean` | não | `false` |  |  |
| 9 | `member_role` | `text` | não | `'member'::text` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| team_conv_members_last_read_at_check | CHECK | `CHECK (last_read_at IS NULL OR last_read_at <= (now() + '00:00:05'::interval))` |  |  | sim |
| team_conversation_members_conversation_id_fkey | FOREIGN KEY | `FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| team_conversation_members_conversation_id_profile_id_key | UNIQUE | `UNIQUE (conversation_id, profile_id)` |  |  | sim |
| team_conversation_members_member_role_check | CHECK | `CHECK (member_role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text]))` |  |  | sim |
| team_conversation_members_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| team_conversation_members_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_team_conv_members_conv_muted | btree | conversation_id, is_muted | não | sim | `(is_muted = true)` | `CREATE INDEX idx_team_conv_members_conv_muted ON public.team_conversation_members USING btree (conversation_id, is_muted) WHERE (is_muted = true)` |
| idx_team_conv_members_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_team_conv_members_profile_id ON public.team_conversation_members USING btree (profile_id)` |
| team_conversation_members_conversation_id_profile_id_key | btree | conversation_id, profile_id | sim | sim |  | `CREATE UNIQUE INDEX team_conversation_members_conversation_id_profile_id_key ON public.team_conversation_members USING btree (conversation_id, profile_id)` |
| team_conversation_members_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX team_conversation_members_pkey ON public.team_conversation_members USING btree (id)` |


## Policies (RLS)

### `tcm_delete_own_or_admin`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(((profile_id = current_profile_id()) OR is_admin_or_supervisor(auth.uid())) AND (NOT is_last_team_conversation_owner(conversation_id, profile_id)))` |
| WITH CHECK |  |

### `tcm_insert_member`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `can_insert_team_conversation_member(conversation_id, profile_id, member_role)` |

### `tcm_select_own`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_team_conversation_member(auth.uid(), conversation_id)` |
| WITH CHECK |  |

### `tcm_update_own_prefs`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(profile_id = current_profile_id())` |
| WITH CHECK | `(profile_id = current_profile_id())` |


## Triggers

_nenhum_


## Grants

_nenhum_
