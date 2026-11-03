# public.talkx_delivery_log

> X033: log por destinatario do motor Talk X (etapa/tentativa/resultado/duracao). SEM telefone e SEM texto de mensagem — so ids, codigos e metricas. Escrita service_role (edge talkx-send), leitura admin/supervisor; expurgo de 30 dias pelo purge_talkx_expired_data.

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


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `campaign_id` | `uuid` | sim |  |  |  |
| 3 | `recipient_id` | `uuid` | sim |  |  |  |
| 4 | `attempt` | `integer` | não | `1` |  | X033: ordinal da tentativa que produziu a linha (1 = primeiro envio ao provedor). |
| 5 | `stage` | `text` | não |  |  |  |
| 6 | `outcome` | `text` | não |  |  |  |
| 7 | `http_status` | `integer` | sim |  |  |  |
| 8 | `error_code` | `text` | sim |  |  |  |
| 9 | `worker_id` | `text` | sim |  |  |  |
| 10 | `duration_ms` | `integer` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_delivery_log_attempt_check | CHECK | `CHECK (attempt >= 0)` |  |  | sim |
| talkx_delivery_log_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_delivery_log_duration_check | CHECK | `CHECK (duration_ms IS NULL OR duration_ms >= 0)` |  |  | sim |
| talkx_delivery_log_http_status_check | CHECK | `CHECK (http_status IS NULL OR http_status >= 100 AND http_status <= 599)` |  |  | sim |
| talkx_delivery_log_outcome_check | CHECK | `CHECK (outcome = ANY (ARRAY['sent'::text, 'failed'::text, 'outcome_unknown'::text, 'skipped'::text, 'rescheduled'::text, 'no_claim'::text, 'stopped'::text]))` |  |  | sim |
| talkx_delivery_log_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_delivery_log_recipient_id_fkey | FOREIGN KEY | `FOREIGN KEY (recipient_id) REFERENCES talkx_recipients(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_delivery_log_stage_check | CHECK | `CHECK (stage = ANY (ARRAY['claim'::text, 'suppress_check'::text, 'dispatch'::text, 'complete'::text, 'reconcile'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_delivery_log_campaign_created_idx | btree | campaign_id, created_at | não | sim |  | `CREATE INDEX talkx_delivery_log_campaign_created_idx ON public.talkx_delivery_log USING btree (campaign_id, created_at DESC)` |
| talkx_delivery_log_created_idx | btree | created_at | não | sim |  | `CREATE INDEX talkx_delivery_log_created_idx ON public.talkx_delivery_log USING btree (created_at)` |
| talkx_delivery_log_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_delivery_log_pkey ON public.talkx_delivery_log USING btree (id)` |
| talkx_delivery_log_recipient_idx | btree | recipient_id, created_at | não | sim |  | `CREATE INDEX talkx_delivery_log_recipient_idx ON public.talkx_delivery_log USING btree (recipient_id, created_at DESC)` |


## Policies (RLS)

### `talkx_delivery_log_select`

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
