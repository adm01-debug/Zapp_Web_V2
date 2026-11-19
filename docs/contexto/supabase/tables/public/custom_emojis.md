# public.custom_emojis

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `image_url` | `text` | não |  |  |  |
| 4 | `category` | `text` | sim | `'outros'::text` |  |  |
| 5 | `is_favorite` | `boolean` | sim | `false` |  |  |
| 6 | `use_count` | `integer` | sim | `0` |  |  |
| 7 | `uploaded_by` | `uuid` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| custom_emojis_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| custom_emojis_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX custom_emojis_pkey ON public.custom_emojis USING btree (id)` |


## Policies (RLS)

### `Authenticated users can insert custom emojis`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(uploaded_by = auth.uid())` |

### `Authenticated users can update custom emojis`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK | `((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))` |

### `Authenticated users can view custom emojis`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `Users can delete own or admin custom emojis`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((uploaded_by = auth.uid()) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
