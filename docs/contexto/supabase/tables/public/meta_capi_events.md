# public.meta_capi_events

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
| 2 | `event_name` | `text` | não |  |  |  |
| 3 | `event_time` | `timestamp with time zone` | sim | `now()` |  |  |
| 4 | `contact_id` | `uuid` | sim |  |  |  |
| 5 | `pixel_id` | `text` | sim |  |  |  |
| 6 | `event_source_url` | `text` | sim |  |  |  |
| 7 | `action_source` | `text` | sim | `'chat'::text` |  |  |
| 8 | `custom_data` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 9 | `sent_to_meta` | `boolean` | sim | `false` |  |  |
| 10 | `meta_response` | `jsonb` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| meta_capi_events_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| meta_capi_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_meta_capi_events_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_meta_capi_events_contact_id ON public.meta_capi_events USING btree (contact_id)` |
| meta_capi_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX meta_capi_events_pkey ON public.meta_capi_events USING btree (id)` |


## Policies (RLS)

### `Admins can manage capi events`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can view capi events`

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
