# public.conversation_snoozes

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `snoozed_by` | `uuid` | não |  |  |  |
| 4 | `snooze_until` | `timestamp with time zone` | não |  |  |  |
| 5 | `reason` | `text` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| conversation_snoozes_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| conversation_snoozes_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| conversation_snoozes_snoozed_by_fkey | FOREIGN KEY | `FOREIGN KEY (snoozed_by) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| conversation_snoozes_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX conversation_snoozes_pkey ON public.conversation_snoozes USING btree (id)` |
| idx_conversation_snoozes_snoozed_by | btree | snoozed_by | não | sim |  | `CREATE INDEX idx_conversation_snoozes_snoozed_by ON public.conversation_snoozes USING btree (snoozed_by)` |
| idx_snoozes_contact | btree | contact_id | não | sim |  | `CREATE INDEX idx_snoozes_contact ON public.conversation_snoozes USING btree (contact_id)` |
| idx_snoozes_until | btree | snooze_until | não | sim |  | `CREATE INDEX idx_snoozes_until ON public.conversation_snoozes USING btree (snooze_until)` |


## Policies (RLS)

### `Users can create own snoozes`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((snoozed_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) AND (EXISTS ( SELECT 1    FROM contacts c   WHERE (c.id = conversation_snoozes.contact_id))))` |

### `Users can delete own snoozes`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(snoozed_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |
| WITH CHECK |  |

### `Users can view own snoozes`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(snoozed_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
