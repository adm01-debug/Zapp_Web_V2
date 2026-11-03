# public.payment_links

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `title` | `text` | não |  |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `amount` | `numeric(12,2)` | não |  |  |  |
| 5 | `currency` | `text` | sim | `'BRL'::text` |  |  |
| 6 | `status` | `text` | sim | `'active'::text` |  |  |
| 7 | `payment_method` | `text` | sim | `'pix'::text` |  |  |
| 8 | `payment_url` | `text` | sim |  |  |  |
| 9 | `external_id` | `text` | sim |  |  |  |
| 10 | `contact_id` | `uuid` | sim |  |  |  |
| 11 | `deal_id` | `uuid` | sim |  |  |  |
| 12 | `created_by` | `uuid` | sim |  |  |  |
| 13 | `paid_at` | `timestamp with time zone` | sim |  |  |  |
| 14 | `expires_at` | `timestamp with time zone` | sim |  |  |  |
| 15 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 16 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| payment_links_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| payment_links_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| payment_links_deal_id_fkey | FOREIGN KEY | `FOREIGN KEY (deal_id) REFERENCES sales_deals(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| payment_links_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_payment_links_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_payment_links_contact_id ON public.payment_links USING btree (contact_id)` |
| idx_payment_links_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_payment_links_created_by ON public.payment_links USING btree (created_by)` |
| idx_payment_links_deal_id | btree | deal_id | não | sim |  | `CREATE INDEX idx_payment_links_deal_id ON public.payment_links USING btree (deal_id)` |
| payment_links_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX payment_links_pkey ON public.payment_links USING btree (id)` |


## Policies (RLS)

### `Admins can delete payment links`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Authenticated can insert payment links`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |

### `Users can update own payment links`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK | `((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |

### `Users can view own payment links`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_payment_links_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
