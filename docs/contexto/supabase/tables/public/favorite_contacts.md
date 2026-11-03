# public.favorite_contacts

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
| 3 | `user_id` | `uuid` | não |  |  |  |
| 4 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| favorite_contacts_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| favorite_contacts_contact_id_user_id_key | UNIQUE | `UNIQUE (contact_id, user_id)` |  |  | sim |
| favorite_contacts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| favorite_contacts_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| favorite_contacts_contact_id_user_id_key | btree | contact_id, user_id | sim | sim |  | `CREATE UNIQUE INDEX favorite_contacts_contact_id_user_id_key ON public.favorite_contacts USING btree (contact_id, user_id)` |
| favorite_contacts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX favorite_contacts_pkey ON public.favorite_contacts USING btree (id)` |
| idx_favorite_contacts_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_favorite_contacts_contact_id ON public.favorite_contacts USING btree (contact_id)` |
| idx_favorite_contacts_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_favorite_contacts_user_id ON public.favorite_contacts USING btree (user_id)` |


## Policies (RLS)

### `Users can create own favorites`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((user_id = auth.uid()) AND (EXISTS ( SELECT 1    FROM contacts c   WHERE (c.id = favorite_contacts.contact_id))))` |

### `Users can delete own favorites`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can update own favorites`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK | `(user_id = auth.uid())` |

### `Users can view own favorites`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
