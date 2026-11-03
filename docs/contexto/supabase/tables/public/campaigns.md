# public.campaigns

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
| 4 | `message_content` | `text` | não |  |  |  |
| 5 | `message_type` | `text` | não | `'text'::text` |  |  |
| 6 | `media_url` | `text` | sim |  |  |  |
| 7 | `status` | `text` | não | `'draft'::text` |  |  |
| 8 | `scheduled_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `started_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `total_contacts` | `integer` | não | `0` |  |  |
| 12 | `sent_count` | `integer` | não | `0` |  |  |
| 13 | `delivered_count` | `integer` | não | `0` |  |  |
| 14 | `read_count` | `integer` | não | `0` |  |  |
| 15 | `failed_count` | `integer` | não | `0` |  |  |
| 16 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 17 | `created_by` | `uuid` | sim |  |  |  |
| 18 | `target_type` | `text` | não | `'all'::text` |  |  |
| 19 | `target_filter` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 20 | `send_interval_seconds` | `integer` | sim | `5` |  |  |
| 21 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 22 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| campaigns_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| campaigns_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| campaigns_status_check | CHECK | `CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'completed'::text, 'cancelled'::text, 'paused'::text]))` |  |  | sim |
| campaigns_target_type_check | CHECK | `CHECK (target_type = ANY (ARRAY['all'::text, 'tag'::text, 'queue'::text, 'custom'::text]))` |  |  | sim |
| campaigns_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.campaign_ab_variants | campaign_ab_variants_campaign_id_fkey | campaign_id | CASCADE |
| public.campaign_contacts | campaign_contacts_campaign_id_fkey | campaign_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| campaigns_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX campaigns_pkey ON public.campaigns USING btree (id)` |
| idx_campaigns_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_campaigns_created_by ON public.campaigns USING btree (created_by)` |
| idx_campaigns_status | btree | status | não | sim |  | `CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status)` |
| idx_campaigns_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_campaigns_whatsapp_connection_id ON public.campaigns USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can insert campaigns`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can manage campaigns`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Campaigns visible to admins or creator`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR (created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_campaigns_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
