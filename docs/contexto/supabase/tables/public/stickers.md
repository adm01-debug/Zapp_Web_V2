# public.stickers

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
| 2 | `name` | `text` | sim |  |  |  |
| 3 | `image_url` | `text` | não |  |  |  |
| 4 | `category` | `text` | sim | `'geral'::text` |  |  |
| 5 | `uploaded_by` | `text` | sim |  |  |  |
| 6 | `is_favorite` | `boolean` | sim | `false` |  |  |
| 7 | `use_count` | `integer` | sim | `0` |  |  |
| 8 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 10 | `owner_id` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| stickers_owner_id_fkey | FOREIGN KEY | `FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| stickers_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_stickers_owner_id | btree | owner_id | não | sim | `(owner_id IS NOT NULL)` | `CREATE INDEX idx_stickers_owner_id ON public.stickers USING btree (owner_id) WHERE (owner_id IS NOT NULL)` |
| stickers_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX stickers_pkey ON public.stickers USING btree (id)` |


## Policies (RLS)

### `Authenticated users can view stickers`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `Sticker delete with ownership`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |

### `Sticker insert with ownership`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid()))` |

### `Sticker update with ownership`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK | `((uploaded_by = (auth.uid())::text) OR is_admin_or_supervisor(auth.uid()))` |


## Triggers

_nenhum_


## Grants

_nenhum_
