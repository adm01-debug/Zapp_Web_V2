# public.channel_connections

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
| usada por views | public.channel_connections_safe |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `channel_type` | `channel_type` | não |  |  |  |
| 3 | `name` | `text` | não |  |  |  |
| 4 | `status` | `text` | não | `'disconnected'::text` |  |  |
| 5 | `config` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 6 | `credentials` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 7 | `webhook_url` | `text` | sim |  |  |  |
| 8 | `is_active` | `boolean` | sim | `true` |  |  |
| 9 | `created_by` | `uuid` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 13 | `external_account_id` | `text` | sim |  |  |  |
| 14 | `external_page_id` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| channel_connections_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| channel_connections_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| channel_connections_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.channel_routing_rules | channel_routing_rules_channel_connection_id_fkey | channel_connection_id | NO ACTION |
| public.contacts | contacts_channel_connection_id_fkey | channel_connection_id | NO ACTION |
| public.messages | messages_channel_connection_id_fkey | channel_connection_id | NO ACTION |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| channel_connections_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX channel_connections_pkey ON public.channel_connections USING btree (id)` |
| idx_channel_connections_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_channel_connections_created_by ON public.channel_connections USING btree (created_by)` |
| idx_channel_connections_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_channel_connections_whatsapp_connection_id ON public.channel_connections USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins full access to channels`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(auth.uid(), 'admin'::app_role)` |
| WITH CHECK | `has_role(auth.uid(), 'admin'::app_role)` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_channel_connections_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
