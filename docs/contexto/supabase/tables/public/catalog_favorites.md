# public.catalog_favorites

> Favoritos do catálogo por agente (E50). RLS por dono (policy ALL TO authenticated); grants de cliente depois do CT-01: SELECT/INSERT/UPDATE/DELETE para authenticated, nada para anon.

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
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `product_id` | `uuid` | não |  |  |  |
| 4 | `product_name` | `text` | não |  |  |  |
| 5 | `product_sku` | `text` | sim |  |  |  |
| 6 | `primary_image_url` | `text` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| catalog_favorites_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| catalog_favorites_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| catalog_favorites_user_id_product_id_key | UNIQUE | `UNIQUE (user_id, product_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| catalog_favorites_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX catalog_favorites_pkey ON public.catalog_favorites USING btree (id)` |
| catalog_favorites_user_id_product_id_key | btree | user_id, product_id | sim | sim |  | `CREATE UNIQUE INDEX catalog_favorites_user_id_product_id_key ON public.catalog_favorites USING btree (user_id, product_id)` |
| idx_catalog_favorites_user_created | btree | user_id, created_at | não | sim |  | `CREATE INDEX idx_catalog_favorites_user_created ON public.catalog_favorites USING btree (user_id, created_at DESC)` |


## Policies (RLS)

### `Users can manage own catalog favorites`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
