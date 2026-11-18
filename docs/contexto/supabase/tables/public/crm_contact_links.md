# public.crm_contact_links

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `zapp_contact_id` | `uuid` | não |  |  |  |
| 3 | `external_contact_id` | `text` | não |  |  |  |
| 4 | `external_company_id` | `text` | sim |  |  |  |
| 5 | `normalized_phone` | `text` | sim |  |  |  |
| 6 | `link_source` | `text` | não | `'phone_lookup'::text` |  |  |
| 7 | `linked_by` | `uuid` | sim |  |  |  |
| 8 | `linked_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `verified_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| crm_contact_links_external_contact_id_key | UNIQUE | `UNIQUE (external_contact_id)` |  |  | sim |
| crm_contact_links_link_source_check | CHECK | `CHECK (link_source = ANY (ARRAY['phone_lookup'::text, 'manual'::text, 'sync_result'::text]))` |  |  | sim |
| crm_contact_links_linked_by_fkey | FOREIGN KEY | `FOREIGN KEY (linked_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| crm_contact_links_normalized_phone_check | CHECK | `CHECK (normalized_phone IS NULL OR normalized_phone ~ '^[0-9]{8,15}$'::text)` |  |  | sim |
| crm_contact_links_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| crm_contact_links_zapp_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (zapp_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT` | RESTRICT | NO ACTION | sim |
| crm_contact_links_zapp_contact_id_key | UNIQUE | `UNIQUE (zapp_contact_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| crm_contact_links_external_contact_id_key | btree | external_contact_id | sim | sim |  | `CREATE UNIQUE INDEX crm_contact_links_external_contact_id_key ON public.crm_contact_links USING btree (external_contact_id)` |
| crm_contact_links_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX crm_contact_links_pkey ON public.crm_contact_links USING btree (id)` |
| crm_contact_links_zapp_contact_id_key | btree | zapp_contact_id | sim | sim |  | `CREATE UNIQUE INDEX crm_contact_links_zapp_contact_id_key ON public.crm_contact_links USING btree (zapp_contact_id)` |
| idx_crm_contact_links_linked_by | btree | linked_by | não | sim | `(linked_by IS NOT NULL)` | `CREATE INDEX idx_crm_contact_links_linked_by ON public.crm_contact_links USING btree (linked_by) WHERE (linked_by IS NOT NULL)` |
| idx_crm_contact_links_phone | btree | normalized_phone | não | sim | `(normalized_phone IS NOT NULL)` | `CREATE INDEX idx_crm_contact_links_phone ON public.crm_contact_links USING btree (normalized_phone) WHERE (normalized_phone IS NOT NULL)` |


## Policies (RLS)

### `Admins manage CRM links`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Visible contact CRM links`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_contact_visible_to_user(zapp_contact_id, auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
