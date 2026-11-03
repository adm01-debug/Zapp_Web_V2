# public.message_reactions

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `message_id` | `uuid` | não |  |  |  |
| 3 | `user_id` | `uuid` | sim |  |  |  |
| 4 | `contact_id` | `uuid` | sim |  |  |  |
| 5 | `emoji` | `text` | não |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| message_reactions_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| message_reactions_message_id_contact_id_emoji_key | UNIQUE | `UNIQUE (message_id, contact_id, emoji)` |  |  | sim |
| message_reactions_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| message_reactions_message_id_user_id_emoji_key | UNIQUE | `UNIQUE (message_id, user_id, emoji)` |  |  | sim |
| message_reactions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| message_reactions_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| reaction_author_check | CHECK | `CHECK (user_id IS NOT NULL OR contact_id IS NOT NULL)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_message_reactions_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_message_reactions_contact_id ON public.message_reactions USING btree (contact_id)` |
| idx_message_reactions_message_id | btree | message_id | não | sim |  | `CREATE INDEX idx_message_reactions_message_id ON public.message_reactions USING btree (message_id)` |
| idx_message_reactions_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_message_reactions_user_id ON public.message_reactions USING btree (user_id)` |
| message_reactions_message_id_contact_id_emoji_key | btree | message_id, contact_id, emoji | sim | sim |  | `CREATE UNIQUE INDEX message_reactions_message_id_contact_id_emoji_key ON public.message_reactions USING btree (message_id, contact_id, emoji)` |
| message_reactions_message_id_user_id_emoji_key | btree | message_id, user_id, emoji | sim | sim |  | `CREATE UNIQUE INDEX message_reactions_message_id_user_id_emoji_key ON public.message_reactions USING btree (message_id, user_id, emoji)` |
| message_reactions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX message_reactions_pkey ON public.message_reactions USING btree (id)` |


## Policies (RLS)

### `Users can view reactions on accessible messages`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((message_id IN ( SELECT m.id    FROM messages m   WHERE (m.contact_id IN ( SELECT c.id            FROM contacts c           WHERE ((c.assigned_to IN ( SELECT p.id                    FROM profiles p                   WHERE (p.user_id = auth.uid()))) OR (c.assigned_to IS NULL)))))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `message_reactions_delete_policy`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((user_id = get_profile_id_for_user(auth.uid())) AND (EXISTS ( SELECT 1    FROM (messages m      JOIN contacts c ON ((c.id = m.contact_id)))   WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))))` |
| WITH CHECK |  |

### `message_reactions_insert_policy`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((user_id = get_profile_id_for_user(auth.uid())) AND (EXISTS ( SELECT 1    FROM (messages m      JOIN contacts c ON ((c.id = m.contact_id)))   WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))))` |

### `message_reactions_select_policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR (user_id = get_profile_id_for_user(auth.uid())) OR (contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT get_visible_agent_ids(auth.uid()) AS get_visible_agent_ids)))))` |
| WITH CHECK |  |

### `message_reactions_update_policy`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((user_id = get_profile_id_for_user(auth.uid())) AND (EXISTS ( SELECT 1    FROM (messages m      JOIN contacts c ON ((c.id = m.contact_id)))   WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))))` |
| WITH CHECK | `((user_id = get_profile_id_for_user(auth.uid())) AND (EXISTS ( SELECT 1    FROM (messages m      JOIN contacts c ON ((c.id = m.contact_id)))   WHERE ((m.id = message_reactions.message_id) AND (is_admin_or_supervisor(auth.uid()) OR (c.assigned_to = get_profile_id_for_user(auth.uid())) OR (c.assigned_to IS NULL))))))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| message_reactions_normalize_author | BEFORE | INSERT OR UPDATE | ROW | enabled | public.message_reactions_normalize_author |


## Grants

_nenhum_
