# public.contact_purchases

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
| 3 | `title` | `text` | não |  |  |  |
| 4 | `description` | `text` | sim |  |  |  |
| 5 | `amount` | `numeric(12,2)` | sim |  |  |  |
| 6 | `currency` | `text` | sim | `'BRL'::text` |  |  |
| 7 | `status` | `text` | sim | `'pending'::text` |  |  |
| 8 | `purchase_type` | `text` | sim | `'purchase'::text` |  |  |
| 9 | `deal_id` | `uuid` | sim |  |  |  |
| 10 | `created_by` | `uuid` | sim |  |  |  |
| 11 | `purchased_at` | `timestamp with time zone` | sim |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `source` | `text` | sim |  |  | Origem da compra (ex.: bitrix24). Linhas antigas ficam com NULL. |
| 15 | `external_id` | `text` | sim |  |  | Identificador da compra na origem (ex.: ID do negócio no Bitrix24); único por origem. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| contact_purchases_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| contact_purchases_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| contact_purchases_deal_id_fkey | FOREIGN KEY | `FOREIGN KEY (deal_id) REFERENCES sales_deals(id)` | NO ACTION | NO ACTION | sim |
| contact_purchases_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contact_purchases_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX contact_purchases_pkey ON public.contact_purchases USING btree (id)` |
| contact_purchases_source_external_id_key | btree | source, external_id | sim | sim | `(external_id IS NOT NULL)` | `CREATE UNIQUE INDEX contact_purchases_source_external_id_key ON public.contact_purchases USING btree (source, external_id) WHERE (external_id IS NOT NULL)` |
| idx_contact_purchases_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_contact_purchases_contact_id ON public.contact_purchases USING btree (contact_id)` |
| idx_contact_purchases_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_contact_purchases_created_by ON public.contact_purchases USING btree (created_by)` |
| idx_contact_purchases_deal_id | btree | deal_id | não | sim |  | `CREATE INDEX idx_contact_purchases_deal_id ON public.contact_purchases USING btree (deal_id)` |


## Policies (RLS)

### `Agents can delete purchases for assigned contacts`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR (is_contact_visible_to_user(contact_id, auth.uid()) AND (created_by = get_profile_id_for_user(auth.uid()))))` |
| WITH CHECK |  |

### `Agents can insert purchases for assigned contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())) AND (created_by = get_profile_id_for_user(auth.uid())))` |

### `Agents can update purchases for assigned contacts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `Agents can view purchases for assigned contacts`

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
| guard_contact_purchase_identity_insert | BEFORE | INSERT | ROW | enabled | public.guard_contact_purchase_identity |
| guard_contact_purchase_identity_update | BEFORE | UPDATE | ROW | enabled | public.guard_contact_purchase_identity |
| update_contact_purchases_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
