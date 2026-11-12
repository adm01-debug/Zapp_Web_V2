# Tabelas

Um arquivo por tabela em `tables/<schema>/<tabela>.md` (colunas, constraints, índices, RLS/policies, triggers, grants). Métricas de volume em `stats.md`.

| tabela | tipo | RLS | policies | colunas | realtime | comentário |
|---|---|---|---|---|---|---|
| [_bkp_261023.agent_stats](tables/bkp_261023/agent_stats.md) | table | não | 0 | 14 | não | [bkp-261023] Snapshot de public.agent_stats em 23/10/2026 (10 linhas). |
| [_bkp_261023.contacts](tables/bkp_261023/contacts.md) | table | não | 0 | 41 | não | [bkp-261023] Snapshot da tabela public.contacts em 23/10/2026 (3730 linhas). |
| [_bkp_261023.csat_surveys](tables/bkp_261023/csat_surveys.md) | table | não | 0 | 7 | não | [bkp-261023] Snapshot de public.csat_surveys em 23/10/2026 (0 linhas). |
| [_bkp_261023.functions_before](tables/bkp_261023/functions_before.md) | table | não | 0 | 2 | não | [bkp-261023] Snapshot das definições de funções antes de migrations críticas (356 funções). |
| [_bkp_261023.global_settings](tables/bkp_261023/global_settings.md) | table | não | 0 | 7 | não | [bkp-261023] Snapshot de public.global_settings em 23/10/2026 (6 linhas). |
| [_bkp_261023.policies_before](tables/bkp_261023/policies_before.md) | table | não | 0 | 8 | não | [bkp-261023] Snapshot das RLS policies antes de migrations críticas (456 policies). |
| [_bkp_261023.schema_migrations](tables/bkp_261023/schema_migrations.md) | table | não | 0 | 3 | não | [bkp-261023] Snapshot de supabase_migrations.schema_migrations em 23/10/2026 (922 linhas). |
| [_bkp_261023.team_messages](tables/bkp_261023/team_messages.md) | table | não | 0 | 15 | não | [bkp-261023] Snapshot de public.team_messages em 23/10/2026 (2 linhas). |
| [_bkp_261023.user_settings](tables/bkp_261023/user_settings.md) | table | não | 0 | 38 | não | [bkp-261023] Snapshot de public.user_settings em 23/10/2026 (4 linhas). |
| [ops.hermes_change_log](tables/ops/hermes_change_log.md) | table | sim | 1 | 25 | não |  |
| [public._rb_message_reactions_contato_20261007001008](tables/public/rb_message_reactions_contato_20261007001008.md) | table | sim | 0 | 2 | não | [RLS-sem-policy: intencional] Tabela de rebuild de 07/10/2026. Acesso apenas por service_role durante scripts de reconciliação. |
| [public._rb_message_reactions_one_per_agent_20261107121000](tables/public/rb_message_reactions_one_per_agent_20261107121000.md) | table | sim | 1 | 6 | não | Rollback privado das duplicatas de reação removidas ao instalar a unicidade por agente/mensagem. |
| [public._zapp_fn_before](tables/public/zapp_fn_before.md) | table | sim | 0 | 2 | não | [RLS-sem-policy: intencional] Snapshot das definições de funções antes de migrations críticas. Só leitura por service_role/DBA. |
| [public._zapp_mig133_log](tables/public/zapp_mig133_log.md) | table | sim | 0 | 5 | não | [RLS-sem-policy: intencional] Log interno da migration 133. Só service_role. |
| [public.agent_achievements](tables/public/agent_achievements.md) | table | sim | 2 | 7 | sim |  |
| [public.agent_mini_game_xp_daily](tables/public/agent_mini_game_xp_daily.md) | table | sim | 0 | 7 | não | [RLS-sem-policy: intencional] Acumulador diário de XP do mini-game. Escrito pelos triggers/edge functions via service_role; leitura pela RPC security-definer get_agent_mini_game_stats. |
| [public.agent_presence](tables/public/agent_presence.md) | table | sim | 3 | 3 | sim |  |
| [public.agent_skills](tables/public/agent_skills.md) | table | sim | 2 | 5 | não |  |
| [public.agent_stats](tables/public/agent_stats.md) | table | sim | 3 | 15 | sim |  |
| [public.agent_visibility_grants](tables/public/agent_visibility_grants.md) | table | sim | 2 | 5 | não |  |
| [public.ai_budget_reservations](tables/public/ai_budget_reservations.md) | table | sim | 0 | 10 | não | [RLS-sem-policy: intencional] Reservas de budget de IA gerenciadas exclusivamente pelo ai-jobs-worker (service_role). Nenhum acesso direto do front. |
| [public.ai_conversation_tags](tables/public/ai_conversation_tags.md) | table | sim | 5 | 6 | não |  |
| [public.ai_jobs](tables/public/ai_jobs.md) | table | sim | 0 | 24 | não | [RLS-sem-policy: intencional] Fila de jobs de IA. Leitura/escrita pelo ai-jobs-worker (service_role). Front acessa status via RPC ai_job_status (security-definer). |
| [public.ai_model_prices](tables/public/ai_model_prices.md) | table | sim | 1 | 11 | não | IA-055: tarifas versionadas por modelo/unidade. valid_from inclusivo, valid_to exclusivo (NULL = vigente). source separa tarifa interna de tarifa reconciliada com o extrato do provedor. |
| [public.ai_providers](tables/public/ai_providers.md) | table | sim | 4 | 15 | não |  |
| [public.ai_usage_logs](tables/public/ai_usage_logs.md) | table | sim | 3 | 16 | não |  |
| [public.ai_usage_outbox](tables/public/ai_usage_outbox.md) | table | sim | 1 | 6 | não |  |
| [public.allowed_countries](tables/public/allowed_countries.md) | table | sim | 3 | 5 | não |  |
| [public.app_settings](tables/public/app_settings.md) | table | sim | 1 | 3 | não |  |
| [public.audio_meme_favorites](tables/public/audio_meme_favorites.md) | table | sim | 1 | 4 | sim |  |
| [public.audio_memes](tables/public/audio_memes.md) | table | sim | 4 | 9 | sim |  |
| [public.audit_logs](tables/public/audit_logs.md) | table | sim | 4 | 10 | não | Trilha de auditoria: login, mudancas de role/permissao, client_error do front (errorReporter) e acoes sensiveis. Leitura restrita a admin. |
| [public.auto_close_config](tables/public/auto_close_config.md) | table | sim | 2 | 7 | não |  |
| [public.automations](tables/public/automations.md) | table | sim | 4 | 12 | não |  |
| [public.away_messages](tables/public/away_messages.md) | table | sim | 2 | 6 | não |  |
| [public.blocked_countries](tables/public/blocked_countries.md) | table | sim | 3 | 6 | não |  |
| [public.blocked_ips](tables/public/blocked_ips.md) | table | sim | 4 | 10 | não |  |
| [public.business_hours](tables/public/business_hours.md) | table | sim | 2 | 8 | não |  |
| [public.calls](tables/public/calls.md) | table | sim | 3 | 23 | sim |  |
| [public.campaign_ab_variants](tables/public/campaign_ab_variants.md) | table | sim | 4 | 11 | não |  |
| [public.campaign_contacts](tables/public/campaign_contacts.md) | table | sim | 3 | 8 | não |  |
| [public.campaigns](tables/public/campaigns.md) | table | sim | 3 | 22 | não |  |
| [public.catalog_favorites](tables/public/catalog_favorites.md) | table | sim | 1 | 7 | não | Favoritos do catálogo por agente (E50). RLS por dono (policy ALL TO authenticated); grants de cliente depois do CT-01: SELECT/INSERT/UPDATE/DELETE para authenticated, nada para anon. |
| [public.catalog_rate_limit_hits](tables/public/catalog_rate_limit_hits.md) | table | sim | 0 | 4 | não | [RLS-sem-policy: intencional] Hits de rate limiting do catálogo de produtos. Gerenciado pela edge function promogifts-catalog via service_role. |
| [public.catalog_rate_limits](tables/public/catalog_rate_limits.md) | table | sim | 0 | 4 | não | [RLS-sem-policy: intencional] Configuração de rate limits do catálogo. Gerenciado pela edge function promogifts-catalog via service_role. |
| [public.catalog_send_events](tables/public/catalog_send_events.md) | table | sim | 2 | 13 | não | Log append-only de envios de produto do catálogo (E28). Uma linha por envio, com status sent/partial/failed e message_ids. Depois do CT-02 o cliente authenticated tem só SELECT e INSERT; mexer no log depois de gravado exige service_role. |
| [public.channel_connections](tables/public/channel_connections.md) | table | sim | 1 | 14 | não |  |
| [public.channel_routing_rules](tables/public/channel_routing_rules.md) | table | sim | 2 | 8 | não |  |
| [public.chatbot_executions](tables/public/chatbot_executions.md) | table | sim | 2 | 10 | não |  |
| [public.chatbot_flows](tables/public/chatbot_flows.md) | table | sim | 3 | 15 | não |  |
| [public.client_wallet_rules](tables/public/client_wallet_rules.md) | table | sim | 2 | 7 | não |  |
| [public.connection_alert_preferences](tables/public/connection_alert_preferences.md) | table | sim | 4 | 8 | não | Preferencias por usuario de alerta de conexao (canais: navegador/e-mail; tipos: degradada/desconectada). Uma linha por usuario; RLS por linha; sem DELETE. |
| [public.connection_health_logs](tables/public/connection_health_logs.md) | table | sim | 3 | 7 | não |  |
| [public.contact_block_audit](tables/public/contact_block_audit.md) | table | sim | 4 | 9 | não | Trilha append-only do bloqueio/desbloqueio de contatos (substitui a etiqueta textual Bloqueado). Escrita apenas pelo trigger audit_contact_block_change. |
| [public.contact_custom_fields](tables/public/contact_custom_fields.md) | table | sim | 4 | 7 | não |  |
| [public.contact_deletion_audit](tables/public/contact_deletion_audit.md) | table | sim | 4 | 9 | não | Trilha append-only de exclusao/restauracao/purge de contato. Gravada por trigger em public.contacts; escrita so via SECURITY DEFINER; leitura so admin/supervisor. |
| [public.contact_identity_map](tables/public/contact_identity_map.md) | table | sim | 1 | 5 | não | Mapa LID -> JID do WhatsApp (identidade anonima vs numero) para reconciliar contatos. |
| [public.contact_notes](tables/public/contact_notes.md) | table | sim | 4 | 10 | não |  |
| [public.contact_protection_policy](tables/public/contact_protection_policy.md) | table | sim | 4 | 9 | não | CT-091: politica de protecao de contatos. scope_role NULL = padrao global; linha por papel sobrepoe. Só o admin altera. |
| [public.contacts](tables/public/contacts.md) | table | sim | 3 | 47 | sim | Contato/cliente por canal (WhatsApp, e-mail, SICOOB): identidade, atribuicao (assigned_to, queue_id), classificacao por IA e conexao de origem. Uma linha = uma conversa/thread ativa com o contato. |
| [public.conversation_analyses](tables/public/conversation_analyses.md) | table | sim | 2 | 25 | não |  |
| [public.conversation_closures](tables/public/conversation_closures.md) | table | sim | 2 | 9 | não |  |
| [public.conversation_events](tables/public/conversation_events.md) | table | sim | 2 | 11 | não | Linha do tempo de uma conversa: transferencias de agente/fila, abertura/fechamento e demais transicoes, com quem executou (performed_by) e metadata. |
| [public.conversation_memory](tables/public/conversation_memory.md) | table | sim | 3 | 11 | não |  |
| [public.conversation_sla](tables/public/conversation_sla.md) | table | sim | 3 | 10 | sim | Instancia de SLA por contato: primeiro contato, primeira resposta (mark_first_response), resolucao e flags de violacao, ligada a sla_configurations. |
| [public.conversation_snoozes](tables/public/conversation_snoozes.md) | table | sim | 3 | 6 | não |  |
| [public.conversation_tasks](tables/public/conversation_tasks.md) | table | sim | 5 | 20 | sim |  |
| [public.copilot_conversation_scores](tables/public/copilot_conversation_scores.md) | table | sim | 3 | 4 | não |  |
| [public.copilot_feedback](tables/public/copilot_feedback.md) | table | sim | 2 | 12 | não |  |
| [public.copilot_help_requests](tables/public/copilot_help_requests.md) | table | sim | 2 | 5 | não |  |
| [public.copilot_insights](tables/public/copilot_insights.md) | table | sim | 2 | 12 | sim |  |
| [public.copilot_learning_moments](tables/public/copilot_learning_moments.md) | table | sim | 2 | 7 | não |  |
| [public.copilot_objection_catalog](tables/public/copilot_objection_catalog.md) | table | sim | 2 | 7 | não |  |
| [public.copilot_outcomes](tables/public/copilot_outcomes.md) | table | sim | 2 | 8 | não |  |
| [public.copilot_seller_settings](tables/public/copilot_seller_settings.md) | table | sim | 3 | 3 | não |  |
| [public.copilot_sessions](tables/public/copilot_sessions.md) | table | sim | 2 | 25 | não |  |
| [public.copilot_usage](tables/public/copilot_usage.md) | table | sim | 2 | 7 | não |  |
| [public.crisis_room_alerts](tables/public/crisis_room_alerts.md) | table | sim | 4 | 10 | não |  |
| [public.crm_contact_links](tables/public/crm_contact_links.md) | table | sim | 2 | 9 | não |  |
| [public.crm_sync_outbox](tables/public/crm_sync_outbox.md) | table | sim | 1 | 20 | não |  |
| [public.csat_auto_config](tables/public/csat_auto_config.md) | table | sim | 2 | 8 | não |  |
| [public.csat_surveys](tables/public/csat_surveys.md) | table | sim | 3 | 12 | não |  |
| [public.custom_emojis](tables/public/custom_emojis.md) | table | sim | 4 | 9 | não |  |
| [public.deal_activities](tables/public/deal_activities.md) | table | sim | 3 | 6 | não |  |
| [public.department_audit_logs](tables/public/department_audit_logs.md) | table | sim | 1 | 7 | não | Immutable audit trail for department membership and config changes |
| [public.department_invitations](tables/public/department_invitations.md) | table | sim | 2 | 13 | não | Pending invitations to join a department (token-based) |
| [public.department_invites](tables/public/department_invites.md) | table | sim | 3 | 6 | não |  |
| [public.departments](tables/public/departments.md) | table | sim | 2 | 8 | não | Organizational departments; each may own a team_conversation of type=department |
| [public.edge_rate_limits](tables/public/edge_rate_limits.md) | table | sim | 0 | 4 | não | [RLS-sem-policy: intencional] Bucket de rate limiting das edge functions. Escrito/lido pelo middleware de rate limit (service_role). Cron cleanup-edge-rate-limits purga a cada 15 min. |
| [public.email_attachments](tables/public/email_attachments.md) | table | sim | 2 | 7 | não | Anexos de email_messages (unico por mensagem+attachment_id). |
| [public.email_labels](tables/public/email_labels.md) | table | sim | 2 | 9 | não |  |
| [public.email_messages](tables/public/email_messages.md) | table | sim | 2 | 24 | sim | Mensagens de e-mail de uma email_thread (corpo texto/HTML sanitizado no front por src/lib/emailHtml.ts). |
| [public.email_signatures](tables/public/email_signatures.md) | table | sim | 4 | 7 | não | Assinaturas de e-mail do proprio usuario (nome, HTML) com no maximo uma padrao por dono (indice unico parcial em user_id when is_default). Dono em user_id = auth.uid(); acesso so do dono. |
| [public.email_threads](tables/public/email_threads.md) | table | sim | 3 | 20 | sim | Threads do Gmail sincronizadas por conta (gmail_accounts), com contato associado, atribuicao e remetente da ultima mensagem. |
| [public.entity_versions](tables/public/entity_versions.md) | table | sim | 2 | 8 | não |  |
| [public.favorite_contacts](tables/public/favorite_contacts.md) | table | sim | 4 | 4 | não |  |
| [public.feature_flags](tables/public/feature_flags.md) | table | sim | 4 | 11 | não | Feature flags globais (key -> enabled). Leitura por qualquer usuario autenticado, escrita apenas admin via RLS. Consumido por useFeatureFlag no front. |
| [public.followup_executions](tables/public/followup_executions.md) | table | sim | 2 | 9 | não |  |
| [public.followup_sequences](tables/public/followup_sequences.md) | table | sim | 2 | 8 | não |  |
| [public.followup_steps](tables/public/followup_steps.md) | table | sim | 2 | 8 | não |  |
| [public.geo_blocking_settings](tables/public/geo_blocking_settings.md) | table | sim | 2 | 5 | não |  |
| [public.global_settings](tables/public/global_settings.md) | table | sim | 2 | 7 | não |  |
| [public.gmail_accounts](tables/public/gmail_accounts.md) | table | sim | 4 | 16 | não |  |
| [public.gmail_oauth_states](tables/public/gmail_oauth_states.md) | table | sim | 0 | 6 | não | [RLS-sem-policy: intencional] Estados temporários do fluxo OAuth do Gmail (PKCE/state). Criados e consumidos pela edge function gmail-oauth (service_role). Expiração automática. |
| [public.goals_configurations](tables/public/goals_configurations.md) | table | sim | 2 | 10 | não |  |
| [public.instance_pauses](tables/public/instance_pauses.md) | table | sim | 1 | 12 | não |  |
| [public.ip_whitelist](tables/public/ip_whitelist.md) | table | sim | 2 | 5 | não |  |
| [public.knowledge_base_articles](tables/public/knowledge_base_articles.md) | table | sim | 2 | 11 | não |  |
| [public.knowledge_base_files](tables/public/knowledge_base_files.md) | table | sim | 2 | 9 | não |  |
| [public.link_preview_cache](tables/public/link_preview_cache.md) | table | sim | 0 | 6 | não | [RLS-sem-policy: intencional] Cache de previews de links. Populado pela edge function fetch-link-preview (service_role). Grants a anon/authenticated revogados em 20261026220300. |
| [public.link_preview_cache_metrics](tables/public/link_preview_cache_metrics.md) | table | sim | 2 | 6 | não |  |
| [public.login_attempts](tables/public/login_attempts.md) | table | sim | 4 | 9 | não | Contador de falhas de login por e-mail com bloqueio exponencial (record_failed_login / is_account_locked / clear_login_attempts). Acesso apenas via SECURITY DEFINER e edges service_role. |
| [public.message_attempts](tables/public/message_attempts.md) | table | sim | 1 | 10 | não |  |
| [public.message_favorites](tables/public/message_favorites.md) | table | sim | 3 | 3 | não |  |
| [public.message_pins](tables/public/message_pins.md) | table | sim | 1 | 5 | não |  |
| [public.message_reactions](tables/public/message_reactions.md) | table | sim | 5 | 6 | sim |  |
| [public.message_reports](tables/public/message_reports.md) | table | sim | 2 | 9 | não |  |
| [public.message_templates](tables/public/message_templates.md) | table | sim | 4 | 10 | não |  |
| [public.messages](tables/public/messages.md) | table | sim | 3 | 43 | sim | Mensagens de todas as origens. O trigger trg_sicoob_reply (Sicoob Bridge) foi removido em 29/09/2026. |
| [public.meta_capi_events](tables/public/meta_capi_events.md) | table | sim | 2 | 11 | não |  |
| [public.mfa_sessions](tables/public/mfa_sessions.md) | table | sim | 1 | 6 | não |  |
| [public.multiplix_audience_members](tables/public/multiplix_audience_members.md) | table | sim | 4 | 6 | não |  |
| [public.multiplix_audiences](tables/public/multiplix_audiences.md) | table | sim | 4 | 10 | não |  |
| [public.multiplix_blocks](tables/public/multiplix_blocks.md) | table | sim | 4 | 16 | não |  |
| [public.multiplix_delivery_items](tables/public/multiplix_delivery_items.md) | table | sim | 1 | 25 | não |  |
| [public.multiplix_dispatches](tables/public/multiplix_dispatches.md) | table | sim | 3 | 34 | sim |  |
| [public.multiplix_events](tables/public/multiplix_events.md) | table | sim | 1 | 8 | não | Trilha append-only do motor de envio Multiplix (F34). So cresce: DELETE sempre rejeitado e UPDATE so e aceito quando seu unico efeito e zerar uma FK (trigger guard_multiplix_event_immutable). FKs: dispatch_id e recipient_id ON DELETE RESTRICT (evento e registro historico). |
| [public.multiplix_recipients](tables/public/multiplix_recipients.md) | table | sim | 2 | 28 | sim |  |
| [public.multiplix_voice_assets](tables/public/multiplix_voice_assets.md) | table | sim | 1 | 10 | não |  |
| [public.multiplix_voice_grants](tables/public/multiplix_voice_grants.md) | table | sim | 2 | 9 | não |  |
| [public.notifications](tables/public/notifications.md) | table | sim | 4 | 10 | sim |  |
| [public.nps_surveys](tables/public/nps_surveys.md) | table | sim | 4 | 7 | não |  |
| [public.number_reputation](tables/public/number_reputation.md) | table | sim | 3 | 12 | não |  |
| [public.outbox_events](tables/public/outbox_events.md) | table | sim | 1 | 10 | não | Outbox genérica de eventos de integração (item 090). Pendente = processed_at is null; a assinatura HMAC-SHA256 do payload é verificada na Edge Function antes de gravar. |
| [public.passkey_credentials](tables/public/passkey_credentials.md) | table | sim | 3 | 11 | não |  |
| [public.password_reset_requests](tables/public/password_reset_requests.md) | table | sim | 5 | 13 | não |  |
| [public.performance_snapshots](tables/public/performance_snapshots.md) | table | sim | 4 | 14 | não |  |
| [public.permissions](tables/public/permissions.md) | table | sim | 2 | 5 | não |  |
| [public.pinned_conversations](tables/public/pinned_conversations.md) | table | sim | 4 | 5 | não |  |
| [public.playbooks](tables/public/playbooks.md) | table | sim | 4 | 9 | não |  |
| [public.products](tables/public/products.md) | table | sim | 3 | 14 | não |  |
| [public.profiles](tables/public/profiles.md) | table | sim | 6 | 21 | não | Perfil de atendente ligado a auth.users: nome, avatar, departamento e role em cache (fonte de verdade de permissao = user_roles + role_permissions). |
| [public.qr_attempts](tables/public/qr_attempts.md) | table | sim | 1 | 5 | não | Historico de tentativas de conexao por QR Code. Escrita so pelo service_role (Edge Function); leitura por quem enxerga a conexao. Apagado aos 30 dias pelo job purge-qr-attempts. |
| [public.query_telemetry](tables/public/query_telemetry.md) | table | sim | 3 | 13 | não |  |
| [public.queue_goals](tables/public/queue_goals.md) | table | sim | 2 | 9 | sim |  |
| [public.queue_members](tables/public/queue_members.md) | table | sim | 2 | 5 | sim |  |
| [public.queue_positions](tables/public/queue_positions.md) | table | sim | 2 | 8 | não |  |
| [public.queue_skill_requirements](tables/public/queue_skill_requirements.md) | table | sim | 2 | 5 | não |  |
| [public.queues](tables/public/queues.md) | table | sim | 2 | 14 | sim | Filas de atendimento (prioridade, tempo maximo de espera) usadas na distribuicao de contatos. |
| [public.rate_limit_configs](tables/public/rate_limit_configs.md) | table | sim | 2 | 9 | não |  |
| [public.rate_limit_logs](tables/public/rate_limit_logs.md) | table | sim | 2 | 10 | não |  |
| [public.reconnection_logs](tables/public/reconnection_logs.md) | table | sim | 1 | 6 | não | Historico das tentativas de reconexao por conexao. Escrito pelo sistema (service_role); retencao de 30 dias. |
| [public.reminders](tables/public/reminders.md) | table | sim | 1 | 10 | não |  |
| [public.role_permissions](tables/public/role_permissions.md) | table | sim | 2 | 4 | não |  |
| [public.sales_deals](tables/public/sales_deals.md) | table | sim | 4 | 17 | sim |  |
| [public.sales_pipeline_stages](tables/public/sales_pipeline_stages.md) | table | sim | 2 | 7 | não |  |
| [public.saved_filters](tables/public/saved_filters.md) | table | sim | 5 | 9 | não |  |
| [public.scheduled_messages](tables/public/scheduled_messages.md) | table | sim | 4 | 14 | não |  |
| [public.scheduled_report_configs](tables/public/scheduled_report_configs.md) | table | sim | 4 | 12 | não |  |
| [public.scheduled_reports](tables/public/scheduled_reports.md) | table | sim | 3 | 12 | não |  |
| [public.search_events](tables/public/search_events.md) | table | sim | 0 | 8 | não |  |
| [public.searchbox_budget_alert_cron](tables/public/searchbox_budget_alert_cron.md) | table | sim | 0 | 4 | não | [RLS-sem-policy: intencional] Controle de execução do cron searchbox-budget-alert. Só service_role via pg_cron. |
| [public.searchbox_budget_alert_emails](tables/public/searchbox_budget_alert_emails.md) | table | sim | 0 | 9 | não | [RLS-sem-policy: intencional] Destinatários dos alertas de budget. Só service_role via edge function searchbox-budget-alert. |
| [public.security_acl_alerts](tables/public/security_acl_alerts.md) | table | sim | 1 | 10 | não |  |
| [public.security_alerts](tables/public/security_alerts.md) | table | sim | 3 | 12 | não |  |
| [public.sicoob_contact_mapping](tables/public/sicoob_contact_mapping.md) | table | sim | 2 | 7 | não |  |
| [public.sla_alert_events](tables/public/sla_alert_events.md) | table | sim | 1 | 8 | não |  |
| [public.sla_alert_preferences](tables/public/sla_alert_preferences.md) | table | sim | 3 | 7 | não |  |
| [public.sla_configurations](tables/public/sla_configurations.md) | table | sim | 2 | 9 | não | Configuracoes de SLA (minutos para primeira resposta e resolucao, prioridade, default). |
| [public.sla_rules](tables/public/sla_rules.md) | table | sim | 4 | 15 | não |  |
| [public.stickers](tables/public/stickers.md) | table | sim | 4 | 10 | não |  |
| [public.talkx_alerts](tables/public/talkx_alerts.md) | table | sim | 1 | 6 | não | X033: alertas do motor Talk X. Um alerta aberto por (tipo, campanha); fechado sozinho quando o sinal deixa de disparar (resolved_at). Escrito por talkx_engine_alerts (service_role), lido por admin/supervisor. |
| [public.talkx_blacklist](tables/public/talkx_blacklist.md) | table | sim | 5 | 13 | sim |  |
| [public.talkx_campaign_events](tables/public/talkx_campaign_events.md) | table | sim | 2 | 8 | sim |  |
| [public.talkx_campaign_segments](tables/public/talkx_campaign_segments.md) | table | sim | 5 | 7 | sim | Talk X (X057): segmentos de uma campanha, em ordem (position 1..10). A ordem define qual segmento "ganha" quando o mesmo contato aparece em mais de um. |
| [public.talkx_campaigns](tables/public/talkx_campaigns.md) | table | sim | 5 | 72 | sim |  |
| [public.talkx_contact_attributes](tables/public/talkx_contact_attributes.md) | table | sim | 1 | 11 | não | Talk X · projeção de atributos comerciais por contato (X037). Nesta leva só as colunas de compra/RFM (X040); as colunas de CRM entram por ALTER nas ondas de banco. |
| [public.talkx_conversions](tables/public/talkx_conversions.md) | table | sim | 1 | 11 | não |  |
| [public.talkx_data_jobs](tables/public/talkx_data_jobs.md) | table | sim | 1 | 7 | não | Talk X · trilha de dados: catálogo dos jobs (X036). Leitura só admin/supervisor; escrita só service_role. |
| [public.talkx_delivery_log](tables/public/talkx_delivery_log.md) | table | sim | 1 | 11 | não | X033: log por destinatario do motor Talk X (etapa/tentativa/resultado/duracao). SEM telefone e SEM texto de mensagem — so ids, codigos e metricas. Escrita service_role (edge talkx-send), leitura admin/supervisor; expurgo de 30 dias pelo purge_talkx_expired_data. |
| [public.talkx_help_views](tables/public/talkx_help_views.md) | table | sim | 2 | 4 | não |  |
| [public.talkx_link_clicks](tables/public/talkx_link_clicks.md) | table | sim | 1 | 6 | não |  |
| [public.talkx_links](tables/public/talkx_links.md) | table | sim | 2 | 12 | não |  |
| [public.talkx_optout_keywords](tables/public/talkx_optout_keywords.md) | table | sim | 2 | 5 | não | Talk X (X029): palavras de opt-out configuraveis. match_mode exact = mensagem inteira; contains = palavra em qualquer posicao. |
| [public.talkx_recipients](tables/public/talkx_recipients.md) | table | sim | 4 | 34 | sim |  |
| [public.talkx_segment_fields](tables/public/talkx_segment_fields.md) | table | sim | 2 | 7 | não |  |
| [public.talkx_segment_library_history](tables/public/talkx_segment_library_history.md) | table | sim | 1 | 7 | não | Talk X (X103): retrato da biblioteca de segmentos por dia (chave counted_on). No mes corrente o dia e o de hoje; nos meses fechados e o ultimo dia do mes. Grava os MESMOS numeros dos KPIs (estoque total/crm360, uso real, entregues e conversoes). Leitura para admin/supervisor; escrita so pela rotina talkx_refresh_segment_library_history. |
| [public.talkx_segment_versions](tables/public/talkx_segment_versions.md) | table | sim | 1 | 8 | não | Talk X (X101): revisoes PUBLICADAS de um segmento (uma linha por publicacao). O gatilho talkx_segment_versions_trim mantem as 20 ultimas; reconstruir uma revisao antiga e o restore da etapa de publicacao. |
| [public.talkx_segments](tables/public/talkx_segments.md) | table | sim | 4 | 22 | sim |  |
| [public.talkx_settings](tables/public/talkx_settings.md) | table | sim | 2 | 4 | não |  |
| [public.talkx_storage_purge_queue](tables/public/talkx_storage_purge_queue.md) | table | sim | 0 | 9 | não | [RLS-sem-policy: intencional] Fila de purge de storage do TalkX. Gerenciada pela edge function talkx-storage-purge (service_role). |
| [public.talkx_suppression_reasons](tables/public/talkx_suppression_reasons.md) | table | sim | 3 | 8 | não |  |
| [public.talkx_template_variants](tables/public/talkx_template_variants.md) | table | sim | 4 | 8 | não |  |
| [public.talkx_template_versions](tables/public/talkx_template_versions.md) | table | sim | 1 | 15 | não | Historico imutavel de templates Talk X; escrita somente pela RPC atomica canonica. |
| [public.talkx_templates](tables/public/talkx_templates.md) | table | sim | 4 | 23 | sim |  |
| [public.talkx_test_send_claims](tables/public/talkx_test_send_claims.md) | table | sim | 0 | 5 | não | [RLS-sem-policy: intencional] Claims para envios de teste do TalkX. Só service_role via talkx-send. |
| [public.talkx_test_sends](tables/public/talkx_test_sends.md) | table | sim | 2 | 10 | não |  |
| [public.team_chat_media_acl_r2_db_020_rb](tables/public/team_chat_media_acl_r2_db_020_rb.md) | table | sim | 0 | 5 | não | [RLS-sem-policy: intencional] Tabela de rebuild para ACL de mídia do Team Chat. Só service_role durante scripts de migração. |
| [public.team_conversation_members](tables/public/team_conversation_members.md) | table | sim | 4 | 9 | sim | Members of a team conversation with read/mute state |
| [public.team_conversations](tables/public/team_conversations.md) | table | sim | 4 | 11 | sim | Chat conversations between team members (direct, group, department) |
| [public.team_message_reactions](tables/public/team_message_reactions.md) | table | sim | 5 | 6 | sim | Emoji reactions on team messages (one per user per emoji per message) |
| [public.team_message_receipts](tables/public/team_message_receipts.md) | table | sim | 3 | 7 | sim | Delivery and read receipts for team messages |
| [public.team_messages](tables/public/team_messages.md) | table | sim | 4 | 15 | sim | Messages within a team conversation |
| [public.training_sessions](tables/public/training_sessions.md) | table | sim | 4 | 11 | não |  |
| [public.user_devices](tables/public/user_devices.md) | table | sim | 5 | 13 | não |  |
| [public.user_roles](tables/public/user_roles.md) | table | sim | 2 | 4 | não | Papeis por usuario (admin, supervisor, agent, special_agent). Alteracoes auditadas em audit_logs por trigger. |
| [public.user_service_accounts](tables/public/user_service_accounts.md) | table | sim | 5 | 7 | não |  |
| [public.user_sessions](tables/public/user_sessions.md) | table | sim | 4 | 11 | não |  |
| [public.user_settings](tables/public/user_settings.md) | table | sim | 3 | 39 | não |  |
| [public.voice_command_logs](tables/public/voice_command_logs.md) | table | sim | 3 | 9 | não |  |
| [public.voip_profile_credentials](tables/public/voip_profile_credentials.md) | table | sim | 0 | 6 | não | [RLS-sem-policy: intencional] Credenciais SIP por perfil. Escrita/leitura pela RPC security-definer set_voip_profile_credentials. Sem grant a anon/authenticated. |
| [public.warroom_alerts](tables/public/warroom_alerts.md) | table | sim | 4 | 9 | sim |  |
| [public.webauthn_challenges](tables/public/webauthn_challenges.md) | table | sim | 2 | 6 | não |  |
| [public.webhook_failures](tables/public/webhook_failures.md) | table | sim | 1 | 11 | não | Dead-letter dos webhooks (endpoint, evento, payload truncado, erro, retries). ACL restrita a service_role. |
| [public.webhook_rate_limits](tables/public/webhook_rate_limits.md) | table | sim | 4 | 6 | não |  |
| [public.whatsapp_connection_queues](tables/public/whatsapp_connection_queues.md) | table | sim | 2 | 4 | não |  |
| [public.whatsapp_connections](tables/public/whatsapp_connections.md) | table | sim | 4 | 25 | sim | Instancias da Evolution GO conectadas (instance_id unico), status da sessao e configuracao de webhook. |
| [public.whatsapp_flows](tables/public/whatsapp_flows.md) | table | sim | 2 | 12 | não |  |
| [public.whatsapp_groups](tables/public/whatsapp_groups.md) | table | sim | 2 | 11 | não |  |
| [public.whatsapp_templates](tables/public/whatsapp_templates.md) | table | sim | 3 | 14 | não |  |
| [public.whisper_messages](tables/public/whisper_messages.md) | table | sim | 4 | 8 | sim |  |
