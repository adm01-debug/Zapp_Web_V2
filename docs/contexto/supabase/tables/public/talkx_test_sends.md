# public.talkx_test_sends

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
| 2 | `template_id` | `uuid` | sim |  |  |  |
| 3 | `campaign_id` | `uuid` | sim |  |  |  |
| 4 | `connection_id` | `uuid` | não |  |  |  |
| 5 | `to_phone` | `text` | não |  |  |  |
| 6 | `status` | `text` | não | `'pending'::text` |  |  |
| 7 | `provider_message_id` | `text` | sim |  |  |  |
| 8 | `error` | `text` | sim |  |  |  |
| 9 | `created_by` | `uuid` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_test_sends_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id)` | NO ACTION | NO ACTION | sim |
| talkx_test_sends_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |
| talkx_test_sends_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_test_sends_template_id_fkey | FOREIGN KEY | `FOREIGN KEY (template_id) REFERENCES talkx_templates(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_test_sends_campaign_id | btree | campaign_id | não | sim |  | `CREATE INDEX idx_talkx_test_sends_campaign_id ON public.talkx_test_sends USING btree (campaign_id)` |
| idx_talkx_test_sends_connection_id | btree | connection_id | não | sim |  | `CREATE INDEX idx_talkx_test_sends_connection_id ON public.talkx_test_sends USING btree (connection_id)` |
| idx_talkx_test_sends_template_id | btree | template_id | não | sim |  | `CREATE INDEX idx_talkx_test_sends_template_id ON public.talkx_test_sends USING btree (template_id)` |
| talkx_test_sends_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_test_sends_pkey ON public.talkx_test_sends USING btree (id)` |


## Policies (RLS)

### `talkx_test_sends_owner_admin_read`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((auth.uid() = created_by) OR (auth.uid() IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.role = 'admin'::text))))` |
| WITH CHECK |  |

### `talkx_test_sends_service_role_write`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | service_role |
| USING | `true` |
| WITH CHECK | `true` |


## Triggers

_nenhum_


## Grants

_nenhum_
