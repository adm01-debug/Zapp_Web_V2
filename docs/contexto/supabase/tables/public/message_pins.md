# public.message_pins

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 1 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `message_id` | `uuid` | não |  |  |  |
| 4 | `pinned_by` | `uuid` | não |  |  |  |
| 5 | `pinned_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| message_pins_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| message_pins_contact_id_message_id_key | UNIQUE | `UNIQUE (contact_id, message_id)` |  |  | sim |
| message_pins_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| message_pins_pinned_by_fkey | FOREIGN KEY | `FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| message_pins_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_message_pins_pinned_by | btree | pinned_by | não | sim |  | `CREATE INDEX idx_message_pins_pinned_by ON public.message_pins USING btree (pinned_by)` |
| message_pins_contact_id_message_id_key | btree | contact_id, message_id | sim | sim |  | `CREATE UNIQUE INDEX message_pins_contact_id_message_id_key ON public.message_pins USING btree (contact_id, message_id)` |
| message_pins_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX message_pins_pkey ON public.message_pins USING btree (id)` |


## Policies (RLS)

### `message_pins_select_visible`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| message_pins_force_contact_id | BEFORE | INSERT OR UPDATE | ROW | enabled | public.message_pins_force_contact_id |


## Grants

_nenhum_
