# public.contact_custom_fields

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
| 3 | `field_name` | `text` | não |  |  |  |
| 4 | `field_value` | `text` | sim |  |  |  |
| 5 | `field_type` | `text` | não | `'text'::text` |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| contact_custom_fields_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| contact_custom_fields_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contact_custom_fields_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX contact_custom_fields_pkey ON public.contact_custom_fields USING btree (id)` |
| idx_contact_custom_fields_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_contact_custom_fields_contact_id ON public.contact_custom_fields USING btree (contact_id)` |
| idx_contact_custom_fields_unique | btree | contact_id, field_name | sim | sim |  | `CREATE UNIQUE INDEX idx_contact_custom_fields_unique ON public.contact_custom_fields USING btree (contact_id, field_name)` |


## Policies (RLS)

### `Authenticated can delete own custom fields`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `Authenticated can update own custom fields`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `Authenticated can view custom fields`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `Users can insert custom fields for assigned contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid()))))) OR is_admin_or_supervisor(auth.uid()))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_contact_custom_fields_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
