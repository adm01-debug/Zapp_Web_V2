# public.conversation_memory

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
| 3 | `facts` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 4 | `objections_handled` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 5 | `promises_made` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 6 | `pending_items` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 7 | `commercial_summary` | `text` | sim |  |  |  |
| 8 | `cumulative_summary` | `text` | sim |  |  |  |
| 9 | `updated_by` | `uuid` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| conversation_memory_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| conversation_memory_contact_id_key | UNIQUE | `UNIQUE (contact_id)` |  |  | sim |
| conversation_memory_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| conversation_memory_updated_by_fkey | FOREIGN KEY | `FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| conversation_memory_contact_id_key | btree | contact_id | sim | sim |  | `CREATE UNIQUE INDEX conversation_memory_contact_id_key ON public.conversation_memory USING btree (contact_id)` |
| conversation_memory_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX conversation_memory_pkey ON public.conversation_memory USING btree (id)` |
| idx_conversation_memory_updated_by | btree | updated_by | não | sim |  | `CREATE INDEX idx_conversation_memory_updated_by ON public.conversation_memory USING btree (updated_by)` |


## Policies (RLS)

### `Agents can insert memory for their contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_contact_visible_to_user(contact_id, auth.uid())` |

### `Agents can update memory for their contacts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_contact_visible_to_user(contact_id, auth.uid())` |
| WITH CHECK |  |

### `Agents or admins can view memory`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_conversation_memory_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
