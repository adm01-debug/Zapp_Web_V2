# public.team_message_receipts

> Delivery and read receipts for team messages

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.team_message_receipts (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 message_id uuid NOT NULL
3 profile_id uuid NOT NULL — profiles.id of recipient — sender cannot have own receipt (enforced by trigger)
4 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 delivered_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
6 read_at timestamp with time zone NULLABLE
7 conversation_id uuid NOT NULL
Constraints:
team_message_receipts_status_check: CHECK (status = ANY (ARRAY['delivered'::text, 'read'::text]))
team_receipts_delivered_at_required: CHECK ((status <> ALL (ARRAY['delivered'::text, 'read'::text])) OR delivered_at IS NOT NULL)
team_receipts_read_at_required: CHECK (status <> 'read'::text OR read_at IS NOT NULL)
team_message_receipts_conversation_id_fkey: FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE
team_message_receipts_message_id_fkey: FOREIGN KEY (message_id) REFERENCES team_messages(id) ON DELETE CASCADE
team_message_receipts_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
team_message_receipts_pkey: PRIMARY KEY (id)
team_message_receipts_message_profile_unique: UNIQUE (message_id, profile_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Conversation members can read receipts" [command=SELECT; roles=authenticated; PERMISSIVE]
"Members can insert own receipts" [command=INSERT; roles=authenticated; PERMISSIVE]
team_message_receipts_update_own [command=UPDATE; roles=authenticated; PERMISSIVE]

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
| usada por views | public.team_message_read_state |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `message_id` | `uuid` | não |  |  |  |
| 3 | `profile_id` | `uuid` | não |  |  | profiles.id of recipient — sender cannot have own receipt (enforced by trigger) |
| 4 | `status` | `text` | não | `'delivered'::text` |  |  |
| 5 | `delivered_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 6 | `read_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `conversation_id` | `uuid` | não |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| team_message_receipts_conversation_id_fkey | FOREIGN KEY | `FOREIGN KEY (conversation_id) REFERENCES team_conversations(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| team_message_receipts_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (message_id) REFERENCES team_messages(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| team_message_receipts_message_profile_unique | UNIQUE | `UNIQUE (message_id, profile_id)` |  |  | sim |
| team_message_receipts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| team_message_receipts_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| team_message_receipts_status_check | CHECK | `CHECK (status = ANY (ARRAY['delivered'::text, 'read'::text]))` |  |  | sim |
| team_receipts_delivered_at_required | CHECK | `CHECK ((status <> ALL (ARRAY['delivered'::text, 'read'::text])) OR delivered_at IS NOT NULL)` |  |  | sim |
| team_receipts_read_at_required | CHECK | `CHECK (status <> 'read'::text OR read_at IS NOT NULL)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_team_message_receipts_conversation_id | btree | conversation_id | não | sim | `(conversation_id IS NOT NULL)` | `CREATE INDEX idx_team_message_receipts_conversation_id ON public.team_message_receipts USING btree (conversation_id) WHERE (conversation_id IS NOT NULL)` |
| idx_team_message_receipts_message_id | btree | message_id | não | sim |  | `CREATE INDEX idx_team_message_receipts_message_id ON public.team_message_receipts USING btree (message_id)` |
| idx_team_message_receipts_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_team_message_receipts_profile_id ON public.team_message_receipts USING btree (profile_id)` |
| idx_team_message_receipts_unread | btree | message_id | não | sim | `(status <> 'read'::text)` | `CREATE INDEX idx_team_message_receipts_unread ON public.team_message_receipts USING btree (message_id) WHERE (status <> 'read'::text)` |
| team_message_receipts_message_profile_unique | btree | message_id, profile_id | sim | sim |  | `CREATE UNIQUE INDEX team_message_receipts_message_profile_unique ON public.team_message_receipts USING btree (message_id, profile_id)` |
| team_message_receipts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX team_message_receipts_pkey ON public.team_message_receipts USING btree (id)` |


## Policies (RLS)

### `Conversation members can read receipts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1    FROM (team_conversation_members mem      JOIN team_messages tm ON ((tm.id = team_message_receipts.message_id)))   WHERE ((mem.conversation_id = tm.conversation_id) AND (mem.profile_id = current_profile_id())))))` |
| WITH CHECK |  |

### `Members can insert own receipts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((profile_id = current_profile_id()) AND (EXISTS ( SELECT 1    FROM (team_conversation_members mem      JOIN team_messages tm ON ((tm.id = team_message_receipts.message_id)))   WHERE ((mem.conversation_id = tm.conversation_id) AND (mem.profile_id = team_message_receipts.profile_id)))))` |

### `team_message_receipts_update_own`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(profile_id = current_profile_id())` |
| WITH CHECK | `((profile_id = current_profile_id()) AND (status = 'read'::text))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| team_message_receipts_update_guard_trig | BEFORE | UPDATE | ROW | enabled | public.team_message_receipts_update_guard |
| team_receipts_fill_conversation_id_trig | BEFORE | INSERT OR UPDATE | ROW | enabled | public.team_receipts_fill_conversation_id |
| team_receipts_no_own_sender_trig | BEFORE | INSERT | ROW | enabled | public.team_receipts_no_own_sender |


## Grants

_nenhum_
