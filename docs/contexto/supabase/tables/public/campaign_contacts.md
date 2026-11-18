# public.campaign_contacts

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
| 2 | `campaign_id` | `uuid` | não |  |  |  |
| 3 | `contact_id` | `uuid` | não |  |  |  |
| 4 | `status` | `text` | não | `'pending'::text` |  |  |
| 5 | `sent_at` | `timestamp with time zone` | sim |  |  |  |
| 6 | `error_message` | `text` | sim |  |  |  |
| 7 | `external_id` | `text` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| campaign_contacts_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| campaign_contacts_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| campaign_contacts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| campaign_contacts_status_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| campaign_contacts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX campaign_contacts_pkey ON public.campaign_contacts USING btree (id)` |
| idx_campaign_contacts_campaign | btree | campaign_id, status | não | sim |  | `CREATE INDEX idx_campaign_contacts_campaign ON public.campaign_contacts USING btree (campaign_id, status)` |
| idx_campaign_contacts_campaign_id | btree | campaign_id | não | sim |  | `CREATE INDEX idx_campaign_contacts_campaign_id ON public.campaign_contacts USING btree (campaign_id)` |
| idx_campaign_contacts_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_campaign_contacts_contact_id ON public.campaign_contacts USING btree (contact_id)` |
| idx_campaign_contacts_status | btree | status | não | sim |  | `CREATE INDEX idx_campaign_contacts_status ON public.campaign_contacts USING btree (status)` |


## Policies (RLS)

### `Admins can insert campaign contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can manage campaign contacts`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can view campaign contacts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
