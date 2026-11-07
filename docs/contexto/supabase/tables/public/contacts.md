# public.contacts

> Contato/cliente por canal (WhatsApp, e-mail, SICOOB): identidade, atribuicao (assigned_to, queue_id), classificacao por IA e conexao de origem. Uma linha = uma conversa/thread ativa com o contato.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `phone` | `text` | não |  |  |  |
| 4 | `email` | `text` | sim |  |  |  |
| 5 | `avatar_url` | `text` | sim |  |  |  |
| 6 | `assigned_to` | `uuid` | sim |  |  |  |
| 7 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 8 | `tags` | `text[]` | sim | `'{}'::text[]` |  |  |
| 9 | `notes` | `text` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `nickname` | `text` | sim |  |  |  |
| 13 | `surname` | `text` | sim |  |  |  |
| 14 | `job_title` | `text` | sim |  |  |  |
| 15 | `company` | `text` | sim |  |  |  |
| 16 | `queue_id` | `uuid` | sim |  |  |  |
| 17 | `contact_type` | `text` | sim | `'cliente'::text` |  | Type of contact: cliente, fornecedor, colaborador, prestador_servico |
| 18 | `ai_priority` | `text` | sim |  |  |  |
| 19 | `ai_sentiment` | `text` | sim |  |  |  |
| 20 | `channel_type` | `text` | sim | `'whatsapp'::text` |  |  |
| 21 | `channel_connection_id` | `uuid` | sim |  |  |  |
| 22 | `group_category` | `text` | sim |  |  |  |
| 23 | `lead_score` | `integer` | sim | `0` |  |  |
| 24 | `risk_score` | `integer` | sim | `0` |  |  |
| 25 | `lead_origin` | `text` | sim |  |  |  |
| 26 | `consent_status` | `text` | sim | `'unknown'::text` |  |  |
| 27 | `avatar_fetch_attempted_at` | `timestamp with time zone` | sim |  |  |  |
| 28 | `conversation_status` | `text` | não | `'open'::text` |  |  |
| 29 | `conversation_status_changed_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 30 | `is_lid_legacy` | `boolean` | não | `false` |  |  |
| 31 | `postal_code` | `text` | sim |  |  | CEP, só dígitos (8 caracteres) |
| 32 | `address` | `text` | sim |  |  | Logradouro (rua, avenida) |
| 33 | `address_number` | `text` | sim |  |  | Número; texto porque aceita S/N |
| 34 | `neighborhood` | `text` | sim |  |  | Bairro |
| 35 | `city` | `text` | sim |  |  | Cidade |
| 36 | `state` | `text` | sim |  |  | UF com 2 letras |
| 37 | `latitude` | `double precision` | sim |  |  |  |
| 38 | `longitude` | `double precision` | sim |  |  |  |
| 39 | `deleted_at` | `timestamp with time zone` | sim |  |  | Soft-delete: NULL = contato vivo. Preenchido por delete_contact()/delete_contacts(). |
| 40 | `ai_projection_updated_at` | `timestamp with time zone` | sim |  |  | Quando a projeção de IA (ai_sentiment/ai_priority) foi escrita pela última vez. Usada para impedir que análise de período antigo sobrescreva projeção mais recente. |
| 41 | `ai_projection_analysis_id` | `uuid` | sim |  |  |  |
| 42 | `presence_status` | `text` | sim |  |  |  |
| 43 | `presence_updated_at` | `timestamp with time zone` | sim |  |  |  |
| 44 | `last_seen_at` | `timestamp with time zone` | sim |  |  |  |
| 45 | `blocked_at` | `timestamp with time zone` | sim |  |  | Instante do bloqueio do contato. NULL = não bloqueado. Substitui a etiqueta textual `Bloqueado` em tags como estado de verdade. |
| 46 | `blocked_by` | `uuid` | sim |  |  | auth.uid() (claim `sub`) de quem bloqueou. NULL quando não bloqueado (ou no backfill da etiqueta legada, que não tem autor). |
| 47 | `phone_search_digits` | `text` | sim | `regexp_replace(COALESCE(phone, ''::text), '[^0-9]'::text, ''::text, 'g'::text)` | s | Somente dígitos de phone, gerados para busca consistente sem alterar o formato exibido. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| chk_contact_type | CHECK | `CHECK (contact_type = ANY (ARRAY['cliente'::text, 'fornecedor'::text, 'transportadora'::text, 'colaborador'::text, 'prestador_servico'::text, 'parceiro'::text]))` |  |  | sim |
| chk_conversation_status_values | CHECK | `CHECK (conversation_status IS NULL OR (conversation_status = ANY (ARRAY['open'::text, 'pending'::text, 'waiting'::text, 'resolved'::text, 'closed'::text, 'archived'::text])))` |  |  | sim |
| contacts_ai_priority_canonical | CHECK | `CHECK (ai_is_canonical_priority(ai_priority))` |  |  | sim |
| contacts_ai_projection_analysis_id_fkey | FOREIGN KEY | `FOREIGN KEY (ai_projection_analysis_id) REFERENCES conversation_analyses(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| contacts_ai_sentiment_canonical | CHECK | `CHECK (ai_is_canonical_sentiment(ai_sentiment))` |  |  | sim |
| contacts_assigned_to_fkey | FOREIGN KEY | `FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| contacts_channel_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id)` | NO ACTION | NO ACTION | sim |
| contacts_consent_status_valores | CHECK | `CHECK (consent_status IS NULL OR (consent_status = ANY (ARRAY['granted'::text, 'unknown'::text, 'revoked'::text])))` |  |  | sim |
| contacts_email_format | CHECK | `CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)` |  |  | sim |
| contacts_phone_key | UNIQUE | `UNIQUE (phone)` |  |  | sim |
| contacts_phone_not_empty | CHECK | `CHECK (length(btrim(phone)) > 0)` |  |  | sim |
| contacts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| contacts_presence_status_check | CHECK | `CHECK (presence_status = ANY (ARRAY['online'::text, 'offline'::text]))` |  |  | sim |
| contacts_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| contacts_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.ai_conversation_tags | ai_conversation_tags_contact_id_fkey | contact_id | NO ACTION |
| public.calls | calls_contact_id_fkey | contact_id | SET NULL |
| public.campaign_contacts | campaign_contacts_contact_id_fkey | contact_id | CASCADE |
| public.catalog_send_events | catalog_send_events_contact_id_fkey | contact_id | CASCADE |
| public.chatbot_executions | chatbot_executions_contact_id_fkey | contact_id | CASCADE |
| public.contact_custom_fields | contact_custom_fields_contact_id_fkey | contact_id | CASCADE |
| public.contact_notes | contact_notes_contact_id_fkey | contact_id | CASCADE |
| public.conversation_analyses | conversation_analyses_contact_id_fkey | contact_id | CASCADE |
| public.conversation_closures | conversation_closures_contact_id_fkey | contact_id | CASCADE |
| public.conversation_events | conversation_events_contact_id_fkey | contact_id | CASCADE |
| public.conversation_memory | conversation_memory_contact_id_fkey | contact_id | CASCADE |
| public.conversation_sla | conversation_sla_contact_id_fkey | contact_id | CASCADE |
| public.conversation_snoozes | conversation_snoozes_contact_id_fkey | contact_id | CASCADE |
| public.conversation_tasks | conversation_tasks_contact_id_fkey | contact_id | SET NULL |
| public.crm_contact_links | crm_contact_links_zapp_contact_id_fkey | zapp_contact_id | RESTRICT |
| public.crm_sync_outbox | crm_sync_outbox_contact_id_fkey | contact_id | SET NULL |
| public.csat_surveys | csat_surveys_contact_id_fkey | contact_id | CASCADE |
| public.email_threads | email_threads_contact_id_fkey | contact_id | SET NULL |
| public.favorite_contacts | favorite_contacts_contact_id_fkey | contact_id | CASCADE |
| public.followup_executions | followup_executions_contact_id_fkey | contact_id | NO ACTION |
| public.message_pins | message_pins_contact_id_fkey | contact_id | CASCADE |
| public.message_reactions | message_reactions_contact_id_fkey | contact_id | CASCADE |
| public.messages | messages_contact_id_fkey | contact_id | CASCADE |
| public.meta_capi_events | meta_capi_events_contact_id_fkey | contact_id | SET NULL |
| public.nps_surveys | nps_surveys_contact_id_fkey | contact_id | CASCADE |
| public.pinned_conversations | pinned_conversations_contact_id_fkey | contact_id | CASCADE |
| public.queue_positions | queue_positions_contact_id_fkey | contact_id | NO ACTION |
| public.reminders | reminders_contact_id_fkey | contact_id | SET NULL |
| public.sales_deals | sales_deals_contact_id_fkey | contact_id | CASCADE |
| public.scheduled_messages | scheduled_messages_contact_id_fkey | contact_id | CASCADE |
| public.sicoob_contact_mapping | sicoob_contact_mapping_contact_id_fkey | contact_id | CASCADE |
| public.sla_alert_events | sla_alert_events_contact_id_fkey | contact_id | CASCADE |
| public.sla_rules | sla_rules_contact_id_fkey | contact_id | CASCADE |
| public.talkx_blacklist | talkx_blacklist_contact_id_fkey | contact_id | CASCADE |
| public.talkx_contact_attributes | talkx_contact_attributes_contact_id_fkey | contact_id | CASCADE |
| public.talkx_recipients | talkx_recipients_contact_id_fkey | contact_id | CASCADE |
| public.whisper_messages | whisper_messages_contact_id_fkey | contact_id | NO ACTION |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contacts_phone_key | btree | phone | sim | sim |  | `CREATE UNIQUE INDEX contacts_phone_key ON public.contacts USING btree (phone)` |
| contacts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX contacts_pkey ON public.contacts USING btree (id)` |
| idx_contacts_ai_projection_analysis_id | btree | ai_projection_analysis_id | não | sim |  | `CREATE INDEX idx_contacts_ai_projection_analysis_id ON public.contacts USING btree (ai_projection_analysis_id)` |
| idx_contacts_assigned_queue | btree | assigned_to, queue_id | não | sim |  | `CREATE INDEX idx_contacts_assigned_queue ON public.contacts USING btree (assigned_to, queue_id)` |
| idx_contacts_assigned_to | btree | assigned_to | não | sim |  | `CREATE INDEX idx_contacts_assigned_to ON public.contacts USING btree (assigned_to)` |
| idx_contacts_assigned_to_gamif | btree | assigned_to | não | sim | `(assigned_to IS NOT NULL)` | `CREATE INDEX idx_contacts_assigned_to_gamif ON public.contacts USING btree (assigned_to) WHERE (assigned_to IS NOT NULL)` |
| idx_contacts_blocked_at | btree | blocked_at | não | sim | `(blocked_at IS NOT NULL)` | `CREATE INDEX idx_contacts_blocked_at ON public.contacts USING btree (blocked_at) WHERE (blocked_at IS NOT NULL)` |
| idx_contacts_channel_connection_id | btree | channel_connection_id | não | sim |  | `CREATE INDEX idx_contacts_channel_connection_id ON public.contacts USING btree (channel_connection_id)` |
| idx_contacts_contact_type | btree | contact_type | não | sim |  | `CREATE INDEX idx_contacts_contact_type ON public.contacts USING btree (contact_type)` |
| idx_contacts_conv_status_active | btree | conversation_status | não | sim | `(conversation_status <> ALL (ARRAY['resolved'::text, 'archived'::text]))` | `CREATE INDEX idx_contacts_conv_status_active ON public.contacts USING btree (conversation_status) WHERE (conversation_status <> ALL (ARRAY['resolved'::text, 'archived'::text]))` |
| idx_contacts_created_at | btree | created_at | não | sim |  | `CREATE INDEX idx_contacts_created_at ON public.contacts USING btree (created_at DESC)` |
| idx_contacts_deleted_at | btree | deleted_at | não | sim | `(deleted_at IS NOT NULL)` | `CREATE INDEX idx_contacts_deleted_at ON public.contacts USING btree (deleted_at) WHERE (deleted_at IS NOT NULL)` |
| idx_contacts_email_trgm | gin | email | não | sim |  | `CREATE INDEX idx_contacts_email_trgm ON public.contacts USING gin (email extensions.gin_trgm_ops)` |
| idx_contacts_is_lid_legacy | btree | is_lid_legacy | não | sim | `(is_lid_legacy = true)` | `CREATE INDEX idx_contacts_is_lid_legacy ON public.contacts USING btree (is_lid_legacy) WHERE (is_lid_legacy = true)` |
| idx_contacts_name_asc | btree | name | não | sim |  | `CREATE INDEX idx_contacts_name_asc ON public.contacts USING btree (name)` |
| idx_contacts_phone_search_digits_trgm | gin | phone_search_digits | não | sim |  | `CREATE INDEX idx_contacts_phone_search_digits_trgm ON public.contacts USING gin (phone_search_digits extensions.gin_trgm_ops)` |
| idx_contacts_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_contacts_queue_id ON public.contacts USING btree (queue_id)` |
| idx_contacts_tags_gin | gin | tags | não | sim |  | `CREATE INDEX idx_contacts_tags_gin ON public.contacts USING gin (tags)` |
| idx_contacts_talk_me_waiting | btree | queue_id, conversation_status, id | não | sim | `((assigned_to IS NULL) AND (deleted_at IS NULL) AND (channel_type = 'whatsapp'::text))` | `CREATE INDEX idx_contacts_talk_me_waiting ON public.contacts USING btree (queue_id, conversation_status, id) WHERE ((assigned_to IS NULL) AND (deleted_at IS NULL) AND (channel_type = 'whatsapp'::text))` |
| idx_contacts_talkx_audience_eligible | btree | id | não | sim | `((deleted_at IS NULL) AND (is_lid_legacy = false) AND (phone ~ '^[0-9]{10,15}$'::text))` | `CREATE INDEX idx_contacts_talkx_audience_eligible ON public.contacts USING btree (id) WHERE ((deleted_at IS NULL) AND (is_lid_legacy = false) AND (phone ~ '^[0-9]{10,15}$'::text))` |
| idx_contacts_updated_at | btree | updated_at | não | sim |  | `CREATE INDEX idx_contacts_updated_at ON public.contacts USING btree (updated_at DESC)` |
| idx_contacts_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_contacts_whatsapp_connection_id ON public.contacts USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Users can insert contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(auth.uid()) OR ((assigned_to IS NOT NULL) AND (assigned_to IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())))))` |

### `Users can update their assigned contacts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `can_edit_contact(assigned_to, queue_id, ( SELECT array_agg(v.v) AS array_agg    FROM get_visible_agent_ids(auth.uid()) v(v)), ( SELECT get_profile_id_for_user(auth.uid()) AS get_profile_id_for_user), ( SELECT is_admin_or_supervisor(auth.uid()) AS is_admin_or_supervisor))` |
| WITH CHECK | `can_edit_contact(assigned_to, queue_id, ( SELECT array_agg(v.v) AS array_agg    FROM get_visible_agent_ids(auth.uid()) v(v)), ( SELECT get_profile_id_for_user(auth.uid()) AS get_profile_id_for_user), ( SELECT is_admin_or_supervisor(auth.uid()) AS is_admin_or_supervisor))` |

### `contacts_select_policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `can_edit_contact(assigned_to, queue_id, ( SELECT array_agg(v.v) AS array_agg    FROM get_visible_agent_ids(auth.uid()) v(v)), ( SELECT get_profile_id_for_user(auth.uid()) AS get_profile_id_for_user), ( SELECT is_admin_or_supervisor(auth.uid()) AS is_admin_or_supervisor))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| on_contact_created_auto_assign | BEFORE | INSERT | ROW | enabled | public.auto_assign_contact |
| on_contact_queue_auto_assign | BEFORE | INSERT | ROW | enabled | public.auto_assign_to_queue_agent |
| queue_overflow_rewrite | AFTER | INSERT OR UPDATE | ROW | enabled | public.queue_overflow_rewrite |
| trg_audit_contact_address_change | AFTER | UPDATE | ROW | enabled | public.audit_contact_address_change |
| trg_audit_contact_block_change | AFTER | UPDATE | ROW | enabled | public.audit_contact_block_change |
| trg_audit_contact_deletion_change | AFTER | UPDATE | ROW | enabled | public.audit_contact_deletion_change |
| trg_audit_contact_purge | AFTER | DELETE | ROW | enabled | public.audit_contact_deletion_change |
| trg_contacts_consent_status_guard | BEFORE | UPDATE | ROW | enabled | public.enforce_contacts_consent_status_guard |
| trg_contacts_fsm_transition | BEFORE | UPDATE | ROW | enabled | public.enforce_conversation_status_transition |
| trg_log_assignment_change | AFTER | UPDATE | ROW | enabled | public.log_assignment_change |
| trg_normalize_contact_phone | BEFORE | INSERT OR UPDATE | ROW | enabled | public.normalize_contact_phone |
| trg_prevent_contact_assignee_hijack | BEFORE | UPDATE | ROW | enabled | public.prevent_contact_assignee_hijack |
| trg_prevent_contact_queue_hijack | BEFORE | UPDATE | ROW | enabled | public.prevent_contact_queue_hijack |
| trg_redact_crm_sync_on_contact_delete | BEFORE | DELETE | ROW | enabled | public.redact_crm_sync_on_contact_delete |
| update_contacts_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
