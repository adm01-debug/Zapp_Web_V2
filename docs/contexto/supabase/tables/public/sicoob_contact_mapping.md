# public.sicoob_contact_mapping

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
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `sicoob_user_id` | `text` | não |  |  |  |
| 4 | `sicoob_vendedor_id` | `text` | não |  |  |  |
| 5 | `sicoob_singular_id` | `text` | não |  |  |  |
| 6 | `zappweb_agent_id` | `uuid` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| sicoob_contact_mapping_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| sicoob_contact_mapping_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key | UNIQUE | `UNIQUE (sicoob_user_id, sicoob_singular_id)` |  |  | sim |
| sicoob_contact_mapping_zappweb_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (zappweb_agent_id) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_sicoob_contact_mapping_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_sicoob_contact_mapping_contact_id ON public.sicoob_contact_mapping USING btree (contact_id)` |
| idx_sicoob_contact_mapping_zappweb_agent_id | btree | zappweb_agent_id | não | sim |  | `CREATE INDEX idx_sicoob_contact_mapping_zappweb_agent_id ON public.sicoob_contact_mapping USING btree (zappweb_agent_id)` |
| sicoob_contact_mapping_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX sicoob_contact_mapping_pkey ON public.sicoob_contact_mapping USING btree (id)` |
| sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key | btree | sicoob_user_id, sicoob_singular_id | sim | sim |  | `CREATE UNIQUE INDEX sicoob_contact_mapping_sicoob_user_id_sicoob_singular_id_key ON public.sicoob_contact_mapping USING btree (sicoob_user_id, sicoob_singular_id)` |


## Policies (RLS)

### `Authenticated users can insert sicoob mappings`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Only admins can view sicoob mappings`

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
