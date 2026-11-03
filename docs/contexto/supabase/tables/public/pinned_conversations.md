# public.pinned_conversations

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `pinned_by` | `uuid` | não |  |  |  |
| 4 | `position` | `integer` | não | `0` |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| pinned_conversations_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| pinned_conversations_contact_id_pinned_by_key | UNIQUE | `UNIQUE (contact_id, pinned_by)` |  |  | sim |
| pinned_conversations_pinned_by_fkey | FOREIGN KEY | `FOREIGN KEY (pinned_by) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| pinned_conversations_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_pinned_conversations_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_pinned_conversations_contact_id ON public.pinned_conversations USING btree (contact_id)` |
| idx_pinned_conversations_pinned_by | btree | pinned_by | não | sim |  | `CREATE INDEX idx_pinned_conversations_pinned_by ON public.pinned_conversations USING btree (pinned_by)` |
| pinned_conversations_contact_id_pinned_by_key | btree | contact_id, pinned_by | sim | sim |  | `CREATE UNIQUE INDEX pinned_conversations_contact_id_pinned_by_key ON public.pinned_conversations USING btree (contact_id, pinned_by)` |
| pinned_conversations_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX pinned_conversations_pkey ON public.pinned_conversations USING btree (id)` |


## Policies (RLS)

### `Users can create own pins`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((pinned_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) AND (EXISTS ( SELECT 1    FROM contacts c   WHERE (c.id = pinned_conversations.contact_id))))` |

### `Users can delete own pins`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(pinned_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |
| WITH CHECK |  |

### `Users can update own pins`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(pinned_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |
| WITH CHECK | `(pinned_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |

### `Users can view own pins`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(pinned_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
