# public.products

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `price` | `numeric(10,2)` | não |  |  |  |
| 5 | `currency` | `text` | não | `'BRL'::text` |  |  |
| 6 | `image_url` | `text` | sim |  |  |  |
| 7 | `category` | `text` | sim |  |  |  |
| 8 | `sku` | `text` | sim |  |  |  |
| 9 | `stock_quantity` | `integer` | sim | `0` |  |  |
| 10 | `is_active` | `boolean` | sim | `true` |  |  |
| 11 | `retailer_id` | `text` | sim |  |  |  |
| 12 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| products_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| products_sku_key | UNIQUE | `UNIQUE (sku)` |  |  | sim |
| products_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_products_active | btree | is_active | não | sim |  | `CREATE INDEX idx_products_active ON public.products USING btree (is_active)` |
| idx_products_category | btree | category | não | sim |  | `CREATE INDEX idx_products_category ON public.products USING btree (category)` |
| idx_products_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_products_whatsapp_connection_id ON public.products USING btree (whatsapp_connection_id)` |
| products_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id)` |
| products_sku_key | btree | sku | sim | sim |  | `CREATE UNIQUE INDEX products_sku_key ON public.products USING btree (sku)` |


## Policies (RLS)

### `Admins can insert products`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can manage products`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated users can view products`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_products_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
