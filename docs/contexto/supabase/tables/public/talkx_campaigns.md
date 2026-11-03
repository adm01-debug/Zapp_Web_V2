# public.talkx_campaigns

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |
| usada por views | public.talkx_campaign_metrics, public.talkx_engine_health |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `message_template` | `text` | não |  |  |  |
| 4 | `variables_config` | `jsonb` | não | `'["nome", "apelido", "empresa", "saudacao"]'::jsonb` |  |  |
| 5 | `typing_delay_min` | `integer` | não | `1500` |  |  |
| 6 | `typing_delay_max` | `integer` | não | `4000` |  |  |
| 7 | `send_interval_min` | `integer` | não | `5000` |  |  |
| 8 | `send_interval_max` | `integer` | não | `15000` |  |  |
| 9 | `status` | `text` | não | `'draft'::text` |  |  |
| 10 | `total_recipients` | `integer` | não | `0` |  |  |
| 11 | `sent_count` | `integer` | não | `0` |  |  |
| 12 | `failed_count` | `integer` | não | `0` |  |  |
| 13 | `delivered_count` | `integer` | não | `0` |  |  |
| 14 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 15 | `created_by` | `uuid` | sim |  |  |  |
| 16 | `started_at` | `timestamp with time zone` | sim |  |  |  |
| 17 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 18 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 19 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 20 | `media_url` | `text` | sim |  |  |  |
| 21 | `media_type` | `text` | sim |  |  |  |
| 22 | `scheduled_at` | `timestamp with time zone` | sim |  |  |  |
| 23 | `description` | `text` | sim |  |  |  |
| 24 | `objective` | `text` | não | `'engajamento'::text` |  |  |
| 25 | `audience_source` | `text` | não | `'contacts'::text` |  |  |
| 26 | `audience_filters` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 27 | `segment_id` | `uuid` | sim |  |  |  |
| 28 | `template_id` | `uuid` | sim |  |  |  |
| 29 | `send_window_start` | `time without time zone` | sim |  |  |  |
| 30 | `send_window_end` | `time without time zone` | sim |  |  |  |
| 31 | `business_hours_only` | `boolean` | não | `false` |  |  |
| 32 | `speed_profile` | `text` | não | `'moderate'::text` |  |  |
| 33 | `paused_at` | `timestamp with time zone` | sim |  |  |  |
| 34 | `outcome_unknown_count` | `integer` | não | `0` |  |  |
| 35 | `schedule_timezone` | `text` | não | `'America/Sao_Paulo'::text` |  | IANA timezone selected by the operator; controls display, send window and business-hours evaluation. |
| 36 | `draft_creation_key` | `uuid` | sim |  |  | Client-generated UUID scoped to created_by; recovers a lost create response without duplicate drafts. |
| 37 | `revision` | `bigint` | não | `1` |  | Monotonic optimistic-concurrency revision for Talk X draft configuration. |
| 38 | `replied_count` | `integer` | não | `0` |  |  |
| 39 | `pause_reason` | `text` | sim |  |  |  |
| 40 | `respect_suppression` | `boolean` | não | `true` |  | Se a campanha respeita a supressão de opt-out; false exige admin/supervisor. |
| 41 | `confirm_consent` | `boolean` | não | `false` |  | Flag de confirmação de consentimento exibida no passo de revisão. |
| 42 | `launched_by` | `uuid` | sim |  |  | Perfil que lançou a campanha (registrado na primeira transição start). |
| 43 | `launched_at` | `timestamp with time zone` | sim |  |  | Momento do primeiro lançamento (registrado na primeira transição start). |
| 44 | `draft_step` | `smallint` | sim | `1` |  | Passo do wizard (1..4) em que o rascunho foi deixado; padrão 1. NULL = rascunho antigo (V23). |
| 45 | `owner` | `uuid` | sim |  |  | Perfil responsável pela campanha (V25). Único responsável desde a unificação owner × responsible_id (20261002451230). Distinto de created_by, que identifica o rascunho. |
| 46 | `responsible_id` | `uuid` | sim |  |  | obsoleta: usar owner (decisão 02/10) |
| 47 | `template_version_id` | `uuid` | sim |  |  | Versao do template (talkx_template_versions.id) que originou a mensagem da campanha (V26). |
| 48 | `worker_id` | `text` | sim |  |  | Worker que detém a trava da campanha (X010). Gerido só pela RPC de lease (claim/release). |
| 49 | `worker_lease_expires_at` | `timestamp with time zone` | sim |  |  | Vencimento do lease do worker (X010). Lease vencido ou nulo libera a campanha para outro worker. |
| 50 | `audience_snapshot_at` | `timestamp with time zone` | sim |  |  | Talk X (X017): instante em que snapshot_talkx_campaign_audience regravou talkx_recipients/total_recipients a partir do rascunho. |
| 51 | `max_per_minute` | `smallint` | sim |  |  |  |
| 52 | `investment` | `numeric(12,2)` | sim |  |  | Investimento total em moeda (BRL); informado pela equipe, fora dos contadores de envio. |
| 53 | `paused_by` | `uuid` | sim |  |  | Perfil que pausou a campanha (X024). |
| 54 | `cancelled_by` | `uuid` | sim |  |  | Perfil que cancelou a campanha (X024). |
| 55 | `cancelled_at` | `timestamp with time zone` | sim |  |  | Momento do cancelamento (X024). |
| 56 | `skipped_count` | `integer` | não | `0` |  | Destinatários pulados pelo motor (lista negra/opt-out) — gerido pelo worker/RPC, nunca pelo cliente (X026). |
| 57 | `read_count` | `integer` | não | `0` |  | Destinatários que leram a mensagem (READ) — gerido pelo worker/RPC, nunca pelo cliente (X027). |
| 58 | `consent_confirmed_by` | `uuid` | sim |  |  | X032: perfil do operador que confirmou a base legal/consentimento no lancamento da campanha. |
| 59 | `consent_confirmed_at` | `timestamp with time zone` | sim |  |  | X032: instante da confirmacao de consentimento; sem ele, agendar e iniciar sao recusados. |
| 60 | `legal_basis` | `text` | sim |  |  | X032: base legal da campanha — consent \| legitimate_interest \| contract (NULL = nao informada). |
| 61 | `recurrence_frequency` | `text` | sim |  |  | Talk X: NULL = nao repete; daily \| weekly. "Personalizado" ainda nao existe. |
| 62 | `recurrence_weekdays` | `smallint[]` | sim |  |  | Talk X: dias da semana da recorrencia semanal (0 = domingo ... 6 = sabado, como extract(dow)). Obrigatorio em weekly, NULL em daily. |
| 63 | `recurrence_end_at` | `timestamp with time zone` | sim |  |  | Talk X: instante limite da serie; ocorrencia que cairia depois dele nao e criada. NULL = sem data de termino. |
| 64 | `recurrence_series_id` | `uuid` | sim |  |  | Talk X: serie da ocorrencia (id da primeira campanha). NULL na primeira. Gravado so por schedule_next_talkx_recurrence. |
| 65 | `recurrence_next_campaign_id` | `uuid` | sim |  |  | Talk X: ocorrencia seguinte ja criada a partir desta. Garante uma unica sucessora por ocorrencia. |
| 66 | `recurrence_closed_at` | `timestamp with time zone` | sim |  |  | Talk X: instante em que a serie foi encerrada a partir desta ocorrencia (sem sucessora). |
| 67 | `recurrence_closed_reason` | `text` | sim |  |  | Talk X: series_ended \| audience_exhausted \| owner_inactive. |
| 68 | `launch_confirmations` | `jsonb` | sim |  |  |  |
| 69 | `launch_confirmed_by` | `uuid` | sim |  |  |  |
| 70 | `launch_confirmed_at` | `timestamp with time zone` | sim |  |  |  |
| 71 | `send_weekdays` | `smallint[]` | sim |  |  |  |
| 72 | `respect_dnd` | `boolean` | não | `true` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_campaigns_audience_source_check | CHECK | `CHECK (audience_source = ANY (ARRAY['contacts'::text, 'segment'::text, 'crm360'::text]))` |  |  | sim |
| talkx_campaigns_cancelled_by_fkey | FOREIGN KEY | `FOREIGN KEY (cancelled_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_consent_confirmed_by_fkey | FOREIGN KEY | `FOREIGN KEY (consent_confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| talkx_campaigns_draft_step_range | CHECK | `CHECK (draft_step IS NULL OR draft_step >= 1 AND draft_step <= 4)` |  |  | sim |
| talkx_campaigns_launch_confirmed_by_fkey | FOREIGN KEY | `FOREIGN KEY (launch_confirmed_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| talkx_campaigns_launched_by_fkey | FOREIGN KEY | `FOREIGN KEY (launched_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| talkx_campaigns_legal_basis_check | CHECK | `CHECK (legal_basis IS NULL OR (legal_basis = ANY (ARRAY['consent'::text, 'legitimate_interest'::text, 'contract'::text])))` |  |  | sim |
| talkx_campaigns_max_per_minute_check | CHECK | `CHECK (max_per_minute IS NULL OR max_per_minute >= 1 AND max_per_minute <= 60)` |  |  | sim |
| talkx_campaigns_owner_fkey | FOREIGN KEY | `FOREIGN KEY (owner) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_paused_by_fkey | FOREIGN KEY | `FOREIGN KEY (paused_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_campaigns_recurrence_next_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (recurrence_next_campaign_id) REFERENCES talkx_campaigns(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_recurrence_shape_check | CHECK | `CHECK (recurrence_frequency IS NULL AND recurrence_weekdays IS NULL OR recurrence_frequency = 'daily'::text AND recurrence_weekdays IS NULL OR recurrence_frequency = 'weekly'::text AND recurrence_weekdays IS NOT NULL AND cardinality(recurrence_weekdays) >= 1 AND cardinality(recurrence_weekdays) <= 7 AND recurrence_weekdays <@ ARRAY[0::smallint, 1::smallint, 2::smallint, 3::smallint, 4::smallint, 5::smallint, 6::smallint])` |  |  | sim |
| talkx_campaigns_responsible_id_fkey | FOREIGN KEY | `FOREIGN KEY (responsible_id) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_revision_positive | CHECK | `CHECK (revision > 0)` |  |  | sim |
| talkx_campaigns_schedule_timezone_valid | CHECK | `CHECK (is_valid_talkx_schedule_timezone(schedule_timezone))` |  |  | sim |
| talkx_campaigns_segment_id_fkey | FOREIGN KEY | `FOREIGN KEY (segment_id) REFERENCES talkx_segments(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_send_interval_max_check | CHECK | `CHECK (send_interval_max <= 86400000)` |  |  | sim |
| talkx_campaigns_send_window_valid | CHECK | `CHECK (send_window_start IS NULL AND send_window_end IS NULL OR send_window_start IS NOT NULL AND send_window_end IS NOT NULL AND send_window_start < send_window_end)` |  |  | sim |
| talkx_campaigns_speed_profile_check | CHECK | `CHECK (speed_profile = ANY (ARRAY['slow'::text, 'moderate'::text, 'fast'::text]))` |  |  | sim |
| talkx_campaigns_status_check | CHECK | `CHECK (status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'paused'::text, 'completed'::text, 'cancelled'::text]))` |  |  | sim |
| talkx_campaigns_template_id_fkey | FOREIGN KEY | `FOREIGN KEY (template_id) REFERENCES talkx_templates(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_template_version_id_fkey | FOREIGN KEY | `FOREIGN KEY (template_version_id) REFERENCES talkx_template_versions(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_campaigns_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.talkx_alerts | talkx_alerts_campaign_id_fkey | campaign_id | CASCADE |
| public.talkx_blacklist | talkx_blacklist_campaign_id_fkey | campaign_id | SET NULL |
| public.talkx_campaign_events | talkx_campaign_events_campaign_id_fkey | campaign_id | CASCADE |
| public.talkx_campaign_segments | talkx_campaign_segments_campaign_id_fkey | campaign_id | CASCADE |
| public.talkx_campaigns | talkx_campaigns_recurrence_next_campaign_id_fkey | recurrence_next_campaign_id | SET NULL |
| public.talkx_conversions | talkx_conversions_campaign_id_fkey | campaign_id | CASCADE |
| public.talkx_delivery_log | talkx_delivery_log_campaign_id_fkey | campaign_id | CASCADE |
| public.talkx_links | talkx_links_campaign_id_fkey | campaign_id | CASCADE |
| public.talkx_recipients | talkx_recipients_campaign_id_fkey | campaign_id | CASCADE |
| public.talkx_test_sends | talkx_test_sends_campaign_id_fkey | campaign_id | NO ACTION |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_campaigns_cancelled_by | btree | cancelled_by | não | sim |  | `CREATE INDEX idx_talkx_campaigns_cancelled_by ON public.talkx_campaigns USING btree (cancelled_by)` |
| idx_talkx_campaigns_consent_confirmed_by | btree | consent_confirmed_by | não | sim |  | `CREATE INDEX idx_talkx_campaigns_consent_confirmed_by ON public.talkx_campaigns USING btree (consent_confirmed_by)` |
| idx_talkx_campaigns_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_talkx_campaigns_created_by ON public.talkx_campaigns USING btree (created_by)` |
| idx_talkx_campaigns_launch_confirmed_by | btree | launch_confirmed_by | não | sim |  | `CREATE INDEX idx_talkx_campaigns_launch_confirmed_by ON public.talkx_campaigns USING btree (launch_confirmed_by)` |
| idx_talkx_campaigns_launched_by | btree | launched_by | não | sim |  | `CREATE INDEX idx_talkx_campaigns_launched_by ON public.talkx_campaigns USING btree (launched_by)` |
| idx_talkx_campaigns_owner | btree | owner | não | sim |  | `CREATE INDEX idx_talkx_campaigns_owner ON public.talkx_campaigns USING btree (owner)` |
| idx_talkx_campaigns_paused_by | btree | paused_by | não | sim |  | `CREATE INDEX idx_talkx_campaigns_paused_by ON public.talkx_campaigns USING btree (paused_by)` |
| idx_talkx_campaigns_recurrence_next | btree | recurrence_next_campaign_id | não | sim |  | `CREATE INDEX idx_talkx_campaigns_recurrence_next ON public.talkx_campaigns USING btree (recurrence_next_campaign_id)` |
| idx_talkx_campaigns_recurrence_pending | btree | completed_at | não | sim | `((recurrence_frequency IS NOT NULL) AND (status = 'completed'::text) AND (recurrence_next_campaign_id IS NULL) AND (recurrence_closed_at IS NULL))` | `CREATE INDEX idx_talkx_campaigns_recurrence_pending ON public.talkx_campaigns USING btree (completed_at) WHERE ((recurrence_frequency IS NOT NULL) AND (status = 'completed'::text) AND (recurrence_next_campaign_id IS NULL) AND (recurrence_closed_at IS NULL))` |
| idx_talkx_campaigns_recurrence_series | btree | recurrence_series_id | não | sim | `(recurrence_series_id IS NOT NULL)` | `CREATE INDEX idx_talkx_campaigns_recurrence_series ON public.talkx_campaigns USING btree (recurrence_series_id) WHERE (recurrence_series_id IS NOT NULL)` |
| idx_talkx_campaigns_responsible_id | btree | responsible_id | não | sim |  | `CREATE INDEX idx_talkx_campaigns_responsible_id ON public.talkx_campaigns USING btree (responsible_id)` |
| idx_talkx_campaigns_scheduled_at | btree | scheduled_at | não | sim | `(status = 'scheduled'::text)` | `CREATE INDEX idx_talkx_campaigns_scheduled_at ON public.talkx_campaigns USING btree (scheduled_at) WHERE (status = 'scheduled'::text)` |
| idx_talkx_campaigns_segment_id | btree | segment_id | não | sim |  | `CREATE INDEX idx_talkx_campaigns_segment_id ON public.talkx_campaigns USING btree (segment_id)` |
| idx_talkx_campaigns_status | btree | status | não | sim |  | `CREATE INDEX idx_talkx_campaigns_status ON public.talkx_campaigns USING btree (status)` |
| idx_talkx_campaigns_template_id | btree | template_id | não | sim |  | `CREATE INDEX idx_talkx_campaigns_template_id ON public.talkx_campaigns USING btree (template_id)` |
| idx_talkx_campaigns_template_version_id | btree | template_version_id | não | sim |  | `CREATE INDEX idx_talkx_campaigns_template_version_id ON public.talkx_campaigns USING btree (template_version_id)` |
| idx_talkx_campaigns_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_talkx_campaigns_whatsapp_connection_id ON public.talkx_campaigns USING btree (whatsapp_connection_id)` |
| idx_talkx_campaigns_worker_lease | btree | worker_lease_expires_at | não | sim | `(worker_id IS NOT NULL)` | `CREATE INDEX idx_talkx_campaigns_worker_lease ON public.talkx_campaigns USING btree (worker_lease_expires_at) WHERE (worker_id IS NOT NULL)` |
| talkx_campaigns_creator_draft_creation_key_uidx | btree | created_by, draft_creation_key | sim | sim | `(draft_creation_key IS NOT NULL)` | `CREATE UNIQUE INDEX talkx_campaigns_creator_draft_creation_key_uidx ON public.talkx_campaigns USING btree (created_by, draft_creation_key) WHERE (draft_creation_key IS NOT NULL)` |
| talkx_campaigns_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_campaigns_pkey ON public.talkx_campaigns USING btree (id)` |


## Policies (RLS)

### `Admins can view all campaigns`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Users can create campaigns`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)) AND is_admin_or_supervisor(auth.uid()))` |

### `Users can delete own draft campaigns`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)) AND is_admin_or_supervisor(auth.uid()) AND (status = 'draft'::text))` |
| WITH CHECK |  |

### `Users can update own campaigns`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)) AND is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK | `((created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)) AND is_admin_or_supervisor(auth.uid()))` |

### `Users can view own campaigns`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| enforce_talkx_campaign_mutability | BEFORE | INSERT OR DELETE OR UPDATE | ROW | enabled | public.enforce_talkx_campaign_mutability |
| guard_talkx_campaign_recurrence_series | BEFORE | INSERT OR UPDATE | ROW | enabled | public.guard_talkx_campaign_recurrence_series |
| record_talkx_campaign_lifecycle_event | AFTER | INSERT OR UPDATE | ROW | enabled | public.record_talkx_campaign_lifecycle_event |
| trg_talkx_template_use_count | AFTER | INSERT OR UPDATE | ROW | enabled | public.trg_talkx_increment_template_use_count |
| update_talkx_campaigns_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
