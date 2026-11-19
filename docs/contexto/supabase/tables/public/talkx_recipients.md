# public.talkx_recipients

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
| usada por views | public.talkx_engine_health |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `campaign_id` | `uuid` | não |  |  |  |
| 3 | `contact_id` | `uuid` | não |  |  |  |
| 4 | `personalized_message` | `text` | sim |  |  |  |
| 5 | `status` | `text` | não | `'pending'::text` |  |  |
| 6 | `sent_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `delivered_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `error_message` | `text` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `variant_id` | `uuid` | sim |  |  |  |
| 12 | `external_id` | `text` | sim |  |  |  |
| 13 | `delivery_claim_token` | `uuid` | sim |  |  |  |
| 14 | `delivery_claimed_at` | `timestamp with time zone` | sim |  |  |  |
| 15 | `delivery_claim_expires_at` | `timestamp with time zone` | sim |  |  |  |
| 16 | `delivery_claimed_by` | `text` | sim |  |  |  |
| 17 | `delivery_attempt_count` | `integer` | não | `0` |  |  |
| 18 | `delivery_last_claim_token` | `uuid` | sim |  |  |  |
| 19 | `provider_dispatch_started_at` | `timestamp with time zone` | sim |  |  |  |
| 20 | `variant_id_snapshot` | `uuid` | sim |  |  |  |
| 21 | `message_snapshot_at` | `timestamp with time zone` | sim |  |  |  |
| 22 | `media_url_snapshot` | `text` | sim |  |  |  |
| 23 | `media_type_snapshot` | `text` | sim |  |  |  |
| 24 | `replied_at` | `timestamp with time zone` | sim |  |  |  |
| 25 | `reply_message_id` | `uuid` | sim |  |  |  |
| 26 | `clicked_at` | `timestamp with time zone` | sim |  |  |  |
| 27 | `click_count` | `integer` | não | `0` |  |  |
| 28 | `attempt_count` | `integer` | não | `0` |  |  |
| 29 | `retry_after` | `timestamp with time zone` | sim |  |  |  |
| 30 | `read_at` | `timestamp with time zone` | sim |  |  |  |
| 31 | `segment_id` | `uuid` | sim |  |  | Talk X (X057): segmento de origem do destinatario — o PRIMEIRO segmento da campanha que contem o contato. |
| 32 | `manual_retry_count` | `smallint` | não | `0` |  | Reenvios MANUAIS de um destinatário em estado terminal (failed/skipped) — teto de 3 (X031). |
| 33 | `status_changed_at` | `timestamp with time zone` | não | `now()` |  | X126: instante da ultima troca REAL de status do destinatario (gatilho trg_talkx_recipients_status_changed_at). Nao acompanha expurgo de PII nem edicao de outros campos (updated_at acompanha). A saude do motor (talkx_engine_health.failure_rate_15m e outcome_unknown_24h) usa esta coluna. |
| 34 | `failed_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_recipients_campaign_id_contact_id_key | UNIQUE | `UNIQUE (campaign_id, contact_id)` |  |  | sim |
| talkx_recipients_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_recipients_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_recipients_delivery_claim_state | CHECK | `CHECK (status = 'sending'::text AND delivery_claim_token IS NOT NULL AND delivery_claimed_at IS NOT NULL AND delivery_claim_expires_at IS NOT NULL AND delivery_claimed_by IS NOT NULL OR status <> 'sending'::text AND delivery_claim_token IS NULL AND delivery_claimed_at IS NULL AND delivery_claim_expires_at IS NULL AND delivery_claimed_by IS NULL)` |  |  | sim |
| talkx_recipients_external_id_bounded | CHECK | `CHECK (external_id IS NULL OR length(btrim(external_id)) >= 1 AND length(btrim(external_id)) <= 512)` |  |  | sim |
| talkx_recipients_media_snapshot_shape | CHECK | `CHECK (media_url_snapshot IS NULL AND media_type_snapshot IS NULL OR length(btrim(media_url_snapshot)) >= 1 AND length(btrim(media_url_snapshot)) <= 8192 AND (media_type_snapshot = ANY (ARRAY['image'::text, 'video'::text, 'document'::text, 'audio'::text])))` |  |  | sim |
| talkx_recipients_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_recipients_reply_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (reply_message_id) REFERENCES messages(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_recipients_status_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text, 'outcome_unknown'::text, 'cancelled'::text]))` |  |  | sim |
| talkx_recipients_variant_id_fkey | FOREIGN KEY | `FOREIGN KEY (variant_id) REFERENCES talkx_template_variants(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.talkx_conversions | talkx_conversions_recipient_id_fkey | recipient_id | SET NULL |
| public.talkx_delivery_log | talkx_delivery_log_recipient_id_fkey | recipient_id | CASCADE |
| public.talkx_link_clicks | talkx_link_clicks_recipient_id_fkey | recipient_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_recipients_campaign_delivered_at | btree | campaign_id, delivered_at | não | sim | `(delivered_at IS NOT NULL)` | `CREATE INDEX idx_talkx_recipients_campaign_delivered_at ON public.talkx_recipients USING btree (campaign_id, delivered_at) WHERE (delivered_at IS NOT NULL)` |
| idx_talkx_recipients_campaign_id | btree | campaign_id | não | sim |  | `CREATE INDEX idx_talkx_recipients_campaign_id ON public.talkx_recipients USING btree (campaign_id)` |
| idx_talkx_recipients_campaign_replied_at | btree | campaign_id, replied_at | não | sim | `(replied_at IS NOT NULL)` | `CREATE INDEX idx_talkx_recipients_campaign_replied_at ON public.talkx_recipients USING btree (campaign_id, replied_at) WHERE (replied_at IS NOT NULL)` |
| idx_talkx_recipients_campaign_segment_status | btree | campaign_id, segment_id, status | não | sim |  | `CREATE INDEX idx_talkx_recipients_campaign_segment_status ON public.talkx_recipients USING btree (campaign_id, segment_id, status)` |
| idx_talkx_recipients_campaign_sent_at | btree | campaign_id, sent_at | não | sim | `(sent_at IS NOT NULL)` | `CREATE INDEX idx_talkx_recipients_campaign_sent_at ON public.talkx_recipients USING btree (campaign_id, sent_at) WHERE (sent_at IS NOT NULL)` |
| idx_talkx_recipients_campaign_status | btree | campaign_id, status | não | sim |  | `CREATE INDEX idx_talkx_recipients_campaign_status ON public.talkx_recipients USING btree (campaign_id, status)` |
| idx_talkx_recipients_claimable | btree | campaign_id, created_at, id | não | sim | `(status = ANY (ARRAY['pending'::text, 'sending'::text]))` | `CREATE INDEX idx_talkx_recipients_claimable ON public.talkx_recipients USING btree (campaign_id, created_at, id) WHERE (status = ANY (ARRAY['pending'::text, 'sending'::text]))` |
| idx_talkx_recipients_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_talkx_recipients_contact_id ON public.talkx_recipients USING btree (contact_id)` |
| idx_talkx_recipients_external_id | btree | external_id | não | sim | `(external_id IS NOT NULL)` | `CREATE INDEX idx_talkx_recipients_external_id ON public.talkx_recipients USING btree (external_id) WHERE (external_id IS NOT NULL)` |
| idx_talkx_recipients_read_at | btree | read_at | não | sim | `(read_at IS NOT NULL)` | `CREATE INDEX idx_talkx_recipients_read_at ON public.talkx_recipients USING btree (read_at) WHERE (read_at IS NOT NULL)` |
| idx_talkx_recipients_replied_at | btree | replied_at | não | sim |  | `CREATE INDEX idx_talkx_recipients_replied_at ON public.talkx_recipients USING btree (replied_at)` |
| idx_talkx_recipients_reply_lookup | btree | contact_id, sent_at | não | sim | `((replied_at IS NULL) AND (sent_at IS NOT NULL))` | `CREATE INDEX idx_talkx_recipients_reply_lookup ON public.talkx_recipients USING btree (contact_id, sent_at DESC) WHERE ((replied_at IS NULL) AND (sent_at IS NOT NULL))` |
| idx_talkx_recipients_reply_message_id | btree | reply_message_id | não | sim |  | `CREATE INDEX idx_talkx_recipients_reply_message_id ON public.talkx_recipients USING btree (reply_message_id)` |
| idx_talkx_recipients_retry | btree | campaign_id, retry_after | não | sim | `((status = 'pending'::text) AND (retry_after IS NOT NULL))` | `CREATE INDEX idx_talkx_recipients_retry ON public.talkx_recipients USING btree (campaign_id, retry_after) WHERE ((status = 'pending'::text) AND (retry_after IS NOT NULL))` |
| idx_talkx_recipients_sent_at | btree | sent_at | não | sim |  | `CREATE INDEX idx_talkx_recipients_sent_at ON public.talkx_recipients USING btree (sent_at)` |
| idx_talkx_recipients_status | btree | status | não | sim |  | `CREATE INDEX idx_talkx_recipients_status ON public.talkx_recipients USING btree (status)` |
| idx_talkx_recipients_variant_id | btree | variant_id | não | sim |  | `CREATE INDEX idx_talkx_recipients_variant_id ON public.talkx_recipients USING btree (variant_id)` |
| talkx_recipients_campaign_id_contact_id_key | btree | campaign_id, contact_id | sim | sim |  | `CREATE UNIQUE INDEX talkx_recipients_campaign_id_contact_id_key ON public.talkx_recipients USING btree (campaign_id, contact_id)` |
| talkx_recipients_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_recipients_pkey ON public.talkx_recipients USING btree (id)` |


## Policies (RLS)

### `Users can delete recipients of own campaigns`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM talkx_campaigns tc   WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) AND (tc.status = 'draft'::text))))` |
| WITH CHECK |  |

### `Users can insert recipients to own campaigns`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(EXISTS ( SELECT 1    FROM talkx_campaigns tc   WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)))))` |

### `Users can update recipients of own campaigns`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM talkx_campaigns tc   WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)))))` |
| WITH CHECK | `(EXISTS ( SELECT 1    FROM talkx_campaigns tc   WHERE ((tc.id = talkx_recipients.campaign_id) AND (tc.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)))))` |

### `Users can view recipients of own campaigns`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM talkx_campaigns tc   WHERE ((tc.id = talkx_recipients.campaign_id) AND ((tc.created_by = ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = auth.uid())          LIMIT 1)) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| enforce_talkx_recipient_snapshot_mutability | BEFORE | INSERT OR DELETE OR UPDATE | ROW | enabled | public.enforce_talkx_recipient_snapshot_mutability |
| trg_talkx_recipients_failed_at | BEFORE | INSERT OR UPDATE | ROW | enabled | public.trg_talkx_recipients_failed_at |
| trg_talkx_recipients_status_changed_at | BEFORE | UPDATE | ROW | enabled | public.set_talkx_recipient_status_changed_at |
| trg_talkx_replied_count | AFTER | UPDATE | ROW | enabled | public.trg_talkx_increment_replied_count |
| update_talkx_recipients_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
