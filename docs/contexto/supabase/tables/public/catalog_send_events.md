# public.catalog_send_events

> Log append-only de envios de produto do catálogo (E28). Uma linha por envio, com status sent/partial/failed e message_ids. Depois do CT-02 o cliente authenticated tem só SELECT e INSERT; mexer no log depois de gravado exige service_role.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.catalog_send_events (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 product_id uuid NOT NULL
3 product_name text NOT NULL
4 product_sku text NULLABLE
5 variant_label text NULLABLE
6 contact_id uuid NULLABLE
7 agent_id uuid NULLABLE
8 template text NULLABLE
9 images_count integer NULLABLE
10 message_length integer NULLABLE
11 status text NULLABLE
12 message_ids jsonb NULLABLE
13 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
catalog_send_events_status_check: CHECK (status = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text]))
catalog_send_events_template_check: CHECK (template = ANY (ARRAY['formal'::text, 'informal'::text, 'promo'::text, 'custom'::text]))
catalog_send_events_agent_id_fkey: FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL
catalog_send_events_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
catalog_send_events_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Users can insert own catalog send events" [command=INSERT; roles=authenticated; PERMISSIVE]
"Users can view own catalog send events" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| usada por views | public.catalog_send_stats |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `product_id` | `uuid` | não |  |  |  |
| 3 | `product_name` | `text` | não |  |  |  |
| 4 | `product_sku` | `text` | sim |  |  |  |
| 5 | `variant_label` | `text` | sim |  |  |  |
| 6 | `contact_id` | `uuid` | sim |  |  |  |
| 7 | `agent_id` | `uuid` | sim |  |  |  |
| 8 | `template` | `text` | sim |  |  |  |
| 9 | `images_count` | `integer` | sim |  |  |  |
| 10 | `message_length` | `integer` | sim |  |  |  |
| 11 | `status` | `text` | sim |  |  |  |
| 12 | `message_ids` | `jsonb` | sim |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| catalog_send_events_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| catalog_send_events_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| catalog_send_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| catalog_send_events_status_check | CHECK | `CHECK (status = ANY (ARRAY['sent'::text, 'partial'::text, 'failed'::text]))` |  |  | sim |
| catalog_send_events_template_check | CHECK | `CHECK (template = ANY (ARRAY['formal'::text, 'informal'::text, 'promo'::text, 'custom'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| catalog_send_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX catalog_send_events_pkey ON public.catalog_send_events USING btree (id)` |
| idx_catalog_send_events_agent_id | btree | agent_id | não | sim |  | `CREATE INDEX idx_catalog_send_events_agent_id ON public.catalog_send_events USING btree (agent_id)` |
| idx_catalog_send_events_contact | btree | contact_id | não | sim |  | `CREATE INDEX idx_catalog_send_events_contact ON public.catalog_send_events USING btree (contact_id)` |
| idx_catalog_send_events_created | btree | created_at | não | sim |  | `CREATE INDEX idx_catalog_send_events_created ON public.catalog_send_events USING btree (created_at DESC)` |
| idx_catalog_send_events_product | btree | product_id | não | sim |  | `CREATE INDEX idx_catalog_send_events_product ON public.catalog_send_events USING btree (product_id)` |


## Policies (RLS)

### `Users can insert own catalog send events`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |

### `Users can view own catalog send events`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
