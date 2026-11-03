# public.csat_auto_config

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
| 2 | `is_enabled` | `boolean` | sim | `false` |  |  |
| 3 | `delay_minutes` | `integer` | sim | `5` |  |  |
| 4 | `message_template` | `text` | sim | `'Olá {name}! Como foi seu atendimento? Avalie de 1 a 5 ⭐'::text` |  |  |
| 5 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 6 | `updated_by` | `uuid` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| csat_auto_config_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| csat_auto_config_updated_by_fkey | FOREIGN KEY | `FOREIGN KEY (updated_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| csat_auto_config_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| csat_auto_config_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX csat_auto_config_pkey ON public.csat_auto_config USING btree (id)` |
| idx_csat_auto_config_updated_by | btree | updated_by | não | sim |  | `CREATE INDEX idx_csat_auto_config_updated_by ON public.csat_auto_config USING btree (updated_by)` |
| idx_csat_auto_config_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_csat_auto_config_whatsapp_connection_id ON public.csat_auto_config USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can manage csat config`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Authenticated can view csat config`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
