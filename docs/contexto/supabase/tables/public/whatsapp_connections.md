# public.whatsapp_connections

> Instancias da Evolution GO conectadas (instance_id unico), status da sessao e configuracao de webhook.

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
| usada por views | public.whatsapp_connections_agent, public.whatsapp_connections_public, public.whatsapp_connections_safe |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `phone_number` | `text` | não |  |  |  |
| 4 | `instance_id` | `text` | sim |  |  |  |
| 5 | `status` | `text` | sim | `'disconnected'::text` |  |  |
| 6 | `qr_code` | `text` | sim |  |  |  |
| 7 | `is_default` | `boolean` | sim | `false` |  |  |
| 8 | `created_by` | `uuid` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `farewell_message` | `text` | sim |  |  |  |
| 12 | `farewell_enabled` | `boolean` | sim | `false` |  |  |
| 13 | `battery_level` | `integer` | sim |  |  |  |
| 14 | `is_plugged` | `boolean` | sim |  |  |  |
| 15 | `retry_count` | `integer` | sim | `0` |  |  |
| 16 | `max_retries` | `integer` | sim | `5` |  |  |
| 17 | `last_health_check` | `timestamp with time zone` | sim |  |  |  |
| 18 | `health_status` | `text` | sim | `'unknown'::text` |  |  |
| 19 | `health_response_ms` | `integer` | sim |  |  |  |
| 20 | `instance_token_secret_id` | `uuid` | sim |  |  |  |
| 21 | `capabilities` | `jsonb` | não | `'{}'::jsonb` |  | F60: o que esta instancia entrega — {"ptt": true, "document": true, "video": false, "max_chars": 4096, "hourly_limit": 200}. Vazio = nao declarado (trata como desconhecido, nao como "tudo pode"). |
| 22 | `auto_reconnect_enabled` | `boolean` | não | `true` |  | Se true, a conexao pode ser reconectada automaticamente apos cair. |
| 23 | `reconnect_interval_seconds` | `integer` | não | `60` |  | Intervalo minimo entre tentativas de reconexao, em segundos (60..3600). |
| 24 | `reconnect_max_attempts` | `integer` | não | `3` |  | Numero maximo de tentativas de reconexao por queda antes de desistir (1..20). |
| 25 | `health_reason` | `text` | sim |  |  | Motivo curto do estado de saude (texto, ate 200 caracteres). Nulo quando nao ha motivo a informar. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| whatsapp_connections_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| whatsapp_connections_health_reason_check | CHECK | `CHECK (health_reason IS NULL OR char_length(btrim(health_reason)) >= 1 AND char_length(btrim(health_reason)) <= 200)` |  |  | sim |
| whatsapp_connections_instance_id_key | UNIQUE | `UNIQUE (instance_id)` |  |  | sim |
| whatsapp_connections_instance_token_secret_id_fkey | FOREIGN KEY | `FOREIGN KEY (instance_token_secret_id) REFERENCES vault.secrets(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| whatsapp_connections_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| whatsapp_connections_reconnect_interval_seconds_check | CHECK | `CHECK (reconnect_interval_seconds >= 60 AND reconnect_interval_seconds <= 3600)` |  |  | sim |
| whatsapp_connections_reconnect_max_attempts_check | CHECK | `CHECK (reconnect_max_attempts >= 1 AND reconnect_max_attempts <= 20)` |  |  | sim |
| whatsapp_connections_status_check | CHECK | `CHECK (status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'connecting'::text, 'qr_pending'::text]))` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.away_messages | away_messages_whatsapp_connection_id_fkey | whatsapp_connection_id | CASCADE |
| public.business_hours | business_hours_whatsapp_connection_id_fkey | whatsapp_connection_id | CASCADE |
| public.calls | calls_whatsapp_connection_id_fkey | whatsapp_connection_id | SET NULL |
| public.campaigns | campaigns_whatsapp_connection_id_fkey | whatsapp_connection_id | NO ACTION |
| public.channel_connections | channel_connections_whatsapp_connection_id_fkey | whatsapp_connection_id | NO ACTION |
| public.chatbot_flows | chatbot_flows_whatsapp_connection_id_fkey | whatsapp_connection_id | NO ACTION |
| public.client_wallet_rules | client_wallet_rules_whatsapp_connection_id_fkey | whatsapp_connection_id | CASCADE |
| public.connection_health_logs | connection_health_logs_connection_id_fkey | connection_id | CASCADE |
| public.contacts | contacts_whatsapp_connection_id_fkey | whatsapp_connection_id | SET NULL |
| public.csat_auto_config | csat_auto_config_whatsapp_connection_id_fkey | whatsapp_connection_id | NO ACTION |
| public.followup_sequences | followup_sequences_whatsapp_connection_id_fkey | whatsapp_connection_id | NO ACTION |
| public.messages | messages_whatsapp_connection_id_fkey | whatsapp_connection_id | SET NULL |
| public.multiplix_dispatches | multiplix_dispatches_whatsapp_connection_id_fkey | whatsapp_connection_id | SET NULL |
| public.number_reputation | number_reputation_whatsapp_connection_id_fkey | whatsapp_connection_id | CASCADE |
| public.products | products_whatsapp_connection_id_fkey | whatsapp_connection_id | SET NULL |
| public.qr_attempts | qr_attempts_connection_id_fkey | connection_id | CASCADE |
| public.reconnection_logs | reconnection_logs_connection_id_fkey | connection_id | CASCADE |
| public.scheduled_messages | scheduled_messages_whatsapp_connection_id_fkey | whatsapp_connection_id | NO ACTION |
| public.talkx_campaigns | talkx_campaigns_whatsapp_connection_id_fkey | whatsapp_connection_id | NO ACTION |
| public.talkx_test_sends | talkx_test_sends_connection_id_fkey | connection_id | NO ACTION |
| public.whatsapp_connection_queues | whatsapp_connection_queues_whatsapp_connection_id_fkey | whatsapp_connection_id | CASCADE |
| public.whatsapp_flows | whatsapp_flows_whatsapp_connection_id_fkey | whatsapp_connection_id | SET NULL |
| public.whatsapp_groups | whatsapp_groups_whatsapp_connection_id_fkey | whatsapp_connection_id | CASCADE |
| public.whatsapp_templates | whatsapp_templates_whatsapp_connection_id_fkey | whatsapp_connection_id | NO ACTION |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_wc_is_default | btree | is_default | não | sim | `(is_default = true)` | `CREATE INDEX idx_wc_is_default ON public.whatsapp_connections USING btree (is_default) WHERE (is_default = true)` |
| idx_whatsapp_connections_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_whatsapp_connections_created_by ON public.whatsapp_connections USING btree (created_by)` |
| idx_whatsapp_connections_instance_token_secret_id | btree | instance_token_secret_id | não | sim |  | `CREATE INDEX idx_whatsapp_connections_instance_token_secret_id ON public.whatsapp_connections USING btree (instance_token_secret_id)` |
| whatsapp_connections_instance_id_key | btree | instance_id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_connections_instance_id_key ON public.whatsapp_connections USING btree (instance_id)` |
| whatsapp_connections_one_default | btree | is_default | sim | sim | `is_default` | `CREATE UNIQUE INDEX whatsapp_connections_one_default ON public.whatsapp_connections USING btree (is_default) WHERE is_default` |
| whatsapp_connections_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_connections_pkey ON public.whatsapp_connections USING btree (id)` |


## Policies (RLS)

### `Admin supervisor view connections`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can delete connections`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can insert connections`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can update connections`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| clear_qr_on_connect_trigger | BEFORE | UPDATE | ROW | enabled | public.clear_qr_on_connect |
| update_whatsapp_connections_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
