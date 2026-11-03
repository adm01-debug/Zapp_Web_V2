# public.notifications

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
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `title` | `text` | não |  |  |  |
| 4 | `message` | `text` | não |  |  |  |
| 5 | `type` | `text` | não | `'info'::text` |  |  |
| 6 | `is_read` | `boolean` | sim | `false` |  |  |
| 7 | `metadata` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `read_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `dedupe_key` | `text` | sim |  |  | IA-047: chave idempotente do aviso (ux_notifications_user_dedupe_key: user_id+dedupe_key único, parcial). |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| notifications_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| notifications_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_notifications_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC)` |
| idx_notifications_is_read | btree | is_read | não | sim |  | `CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read)` |
| idx_notifications_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id)` |
| notifications_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX notifications_pkey ON public.notifications USING btree (id)` |
| ux_notifications_user_dedupe_key | btree | user_id, dedupe_key | sim | sim | `(dedupe_key IS NOT NULL)` | `CREATE UNIQUE INDEX ux_notifications_user_dedupe_key ON public.notifications USING btree (user_id, dedupe_key) WHERE (dedupe_key IS NOT NULL)` |


## Policies (RLS)

### `Block authenticated notification inserts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `false` |

### `Users can delete own notifications`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can update own notifications`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |

### `Users can view own notifications`

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
