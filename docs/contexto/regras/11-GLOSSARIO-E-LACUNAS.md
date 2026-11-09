# 11 · GLOSSÁRIO, DADOS DE REFERÊNCIA E LACUNAS

> Gerado automaticamente por AI Context Sync v1.3.2 · commit `568d3f9326` · branch `main` · 2026-11-09 06:15 UTC
> Não edite à mão — regras humanas vão em `manual/`.

## Glossário do domínio (entidades do sistema)

| Termo | Significado / valores | Tamanho | Origem |
|---|---|---|---|
| `_rb_message_reactions_contato_20261007001008` | [RLS-sem-policy: intencional] Tabela de rebuild de 07/10/2026. Acesso apenas por service_role durante scripts de reconciliação. | 2 colunas | migration |
| `_rb_message_reactions_one_per_agent_20261107121000` | Rollback privado das duplicatas de reação removidas ao instalar a unicidade por agente/mensagem. | 6 colunas | migration |
| `_zapp_fn_before` | _(sem COMMENT ON TABLE — significado não documentado)_ | 2 colunas | types.ts |
| `_zapp_mig133_log` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | types.ts |
| `agent_achievements` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `agent_mini_game_xp_daily` | [RLS-sem-policy: intencional] Acumulador diário de XP do mini-game. Escrito pelos triggers/edge functions via service_role; leitura pela RPC security-definer get_agent_mini_game_stats. | 7 colunas | migration |
| `agent_presence` | _(sem COMMENT ON TABLE — significado não documentado)_ | 3 colunas | migration |
| `agent_skills` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `agent_stats` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `agent_visibility_grants` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `ai_budget_reservations` | [RLS-sem-policy: intencional] Reservas de budget de IA gerenciadas exclusivamente pelo ai-jobs-worker (service_role). Nenhum acesso direto do front. | 10 colunas | migration |
| `ai_conversation_tags` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `ai_jobs` | [RLS-sem-policy: intencional] Fila de jobs de IA. Leitura/escrita pelo ai-jobs-worker (service_role). Front acessa status via RPC ai_job_status (security-definer). | 24 colunas | migration |
| `ai_model_prices` | IA-055: tarifas versionadas por modelo/unidade. valid_from inclusivo, valid_to exclusivo (NULL = vigente). source separa tarifa interna de tarifa reconciliada com o extrato do provedor. | 11 colunas | migration |
| `ai_providers` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `ai_usage_logs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `ai_usage_outbox` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `allowed_countries` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `app_settings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 3 colunas | migration |
| `audio_meme_favorites` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `audio_memes` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `audit_logs` | Trilha de auditoria: login, mudancas de role/permissao, client_error do front (errorReporter) e acoes sensiveis. Leitura restrita a admin. | 10 colunas | migration |
| `auth.users` | _(sem COMMENT ON TABLE — significado não documentado)_ | 1 colunas | migration |
| `auto_close_config` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `automations` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `away_messages` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `blocked_countries` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `blocked_ips` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `business_hours` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `calls` | _(sem COMMENT ON TABLE — significado não documentado)_ | 23 colunas | migration |
| `campaign_ab_variants` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `campaign_contacts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `campaigns` | _(sem COMMENT ON TABLE — significado não documentado)_ | 22 colunas | migration |
| `catalog_favorites` | Favoritos do catálogo por agente (E50). RLS por dono (policy ALL TO authenticated); grants  | 7 colunas | migration |
| `catalog_rate_limit_hits` | [RLS-sem-policy: intencional] Hits de rate limiting do catálogo de produtos. Gerenciado pela edge function promogifts-catalog via service_role. | 4 colunas | migration |
| `catalog_rate_limits` | [RLS-sem-policy: intencional] Configuração de rate limits do catálogo. Gerenciado pela edge function promogifts-catalog via service_role. | 4 colunas | migration |
| `catalog_send_events` | Log append-only de envios de produto do catálogo (E28). Uma linha por envio, com status  | 13 colunas | migration |
| `catalog_send_stats` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `channel_connections` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `channel_connections_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | types.ts |
| `channel_routing_rules` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `chatbot_executions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `chatbot_flows` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `client_wallet_rules` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `connection_alert_preferences` | Preferencias por usuario de alerta de conexao (canais: navegador/e-mail; tipos: degradada/desconectada). Uma linha por usuario; RLS por linha; sem DELETE. | 8 colunas | migration |
| `connection_health_logs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `contact_block_audit` | Trilha append-only do bloqueio/desbloqueio de contatos (substitui a etiqueta textual Bloqueado). Escrita apenas pelo trigger audit_contact_block_change. | 9 colunas | migration |
| `contact_custom_fields` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `contact_deletion_audit` | Trilha append-only de exclusao/restauracao/purge de contato. Gravada por trigger em public.contacts; escrita so via SECURITY DEFINER; leitura so admin/supervisor. | 9 colunas | migration |
| `contact_identity_map` | Mapa LID -> JID do WhatsApp (identidade anonima vs numero) para reconciliar contatos. | 5 colunas | migration |
| `contact_notes` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `contact_protection_policy` | CT-091: politica de protecao de contatos. scope_role NULL = padrao global; linha por papel sobrepoe. Só o admin altera. | 9 colunas | migration |
| `contacts` | Contato/cliente por canal (WhatsApp, e-mail, SICOOB): identidade, atribuicao (assigned_to, queue_id), classificacao por IA e conexao de origem. Uma linha = uma conversa/thread ativa com o contato. | 47 colunas | migration |
| `conversation_analyses` | _(sem COMMENT ON TABLE — significado não documentado)_ | 25 colunas | migration |
| `conversation_closures` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `conversation_events` | Linha do tempo de uma conversa: transferencias de agente/fila, abertura/fechamento e demais transicoes, com quem executou (performed_by) e metadata. | 11 colunas | migration |
| `conversation_memory` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `conversation_sla` | Instancia de SLA por contato: primeiro contato, primeira resposta (mark_first_response), resolucao e flags de violacao, ligada a sla_configurations. | 10 colunas | migration |
| `conversation_snoozes` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `conversation_tasks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | migration |
| `copilot_conversation_scores` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `copilot_feedback` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `copilot_help_requests` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `copilot_insights` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `copilot_learning_moments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `copilot_objection_catalog` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `copilot_outcomes` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `copilot_seller_settings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 3 colunas | migration |
| `copilot_sessions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 24 colunas | migration |
| `copilot_usage` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `crisis_room_alerts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `crm_contact_links` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `crm_sync_outbox` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | migration |
| `csat_auto_config` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `csat_surveys` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `custom_emojis` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `deal_activities` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `department_audit_logs` | Immutable audit trail for department membership and config changes | 7 colunas | migration |
| `department_invitations` | Pending invitations to join a department (token-based) | 13 colunas | migration |
| `department_invites` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `departments` | Organizational departments; each may own a team_conversation of type=department | 8 colunas | migration |
| `edge_rate_limits` | [RLS-sem-policy: intencional] Bucket de rate limiting das edge functions. Escrito/lido pelo middleware de rate limit (service_role). Cron cleanup-edge-rate-limits purga a cada 15 min. | 4 colunas | migration |
| `email_attachments` | Anexos de email_messages (unico por mensagem+attachment_id). | 7 colunas | migration |
| `email_labels` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `email_messages` | Mensagens de e-mail de uma email_thread (corpo texto/HTML sanitizado no front por src/lib/emailHtml.ts). | 24 colunas | migration |
| `email_signatures` | Assinaturas de e-mail do proprio usuario (nome, HTML) com no maximo uma padrao por dono (indice unico parcial em user_id when is_default). Dono em user_id = auth.uid(); acesso so do dono. | 7 colunas | migration |
| `email_threads` | Threads do Gmail sincronizadas por conta (gmail_accounts), com contato associado, atribuicao e remetente da ultima mensagem. | 20 colunas | migration |
| `entity_versions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `favorite_contacts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `feature_flags` | Feature flags globais (key -> enabled). Leitura por qualquer usuario autenticado, escrita apenas admin via RLS. Consumido por useFeatureFlag no front. | 11 colunas | migration |
| `followup_executions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `followup_sequences` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `followup_steps` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `geo_blocking_settings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `global_settings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `gmail_accounts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `gmail_accounts_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | types.ts |
| `gmail_oauth_states` | [RLS-sem-policy: intencional] Estados temporários do fluxo OAuth do Gmail (PKCE/state). Criados e consumidos pela edge function gmail-oauth (service_role). Expiração automática. | 6 colunas | migration |
| `goals_configurations` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `instance_pauses` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `ip_whitelist` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `knowledge_base_articles` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `knowledge_base_files` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `link_preview_cache` | [RLS-sem-policy: intencional] Cache de previews de links. Populado pela edge function fetch-link-preview (service_role). Grants a anon/authenticated revogados em 20261026220300. | 6 colunas | migration |
| `link_preview_cache_metrics` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `login_attempts` | Contador de falhas de login por e-mail com bloqueio exponencial (record_failed_login / is_account_locked / clear_login_attempts). Acesso apenas via SECURITY DEFINER e edges service_role. | 9 colunas | migration |
| `message_attempts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `message_favorites` | _(sem COMMENT ON TABLE — significado não documentado)_ | 3 colunas | migration |
| `message_pins` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `message_reactions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `message_reports` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `message_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `messages` | Mensagens de todas as origens. O trigger trg_sicoob_reply (Sicoob Bridge) foi removido em 29/09/2026. | 41 colunas | migration |
| `meta_capi_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `mfa_sessions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `multiplix_audience_members` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `multiplix_audiences` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `multiplix_blocks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 16 colunas | migration |
| `multiplix_delivery_items` | _(sem COMMENT ON TABLE — significado não documentado)_ | 25 colunas | migration |
| `multiplix_dispatches` | _(sem COMMENT ON TABLE — significado não documentado)_ | 34 colunas | migration |
| `multiplix_events` | Trilha append-only do motor de envio Multiplix (F34). So cresce: DELETE sempre rejeitado e  | 8 colunas | migration |
| `multiplix_recipients` | _(sem COMMENT ON TABLE — significado não documentado)_ | 28 colunas | migration |
| `multiplix_voice_assets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `multiplix_voice_grants` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `notifications` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `nps_surveys` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `number_reputation` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `ops.hermes_change_log` | _(sem COMMENT ON TABLE — significado não documentado)_ | 25 colunas | migration |
| `optout_call_log` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `outbox_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | types.ts |
| `passkey_credentials` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `password_reset_requests` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `password_reset_requests_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | types.ts |
| `performance_snapshots` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `permissions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `pinned_conversations` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `playbooks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `products` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `profiles` | Perfil de atendente ligado a auth.users: nome, avatar, departamento e role em cache (fonte de verdade de permissao = user_roles + role_permissions). | 21 colunas | migration |
| `profiles_public` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | types.ts |
| `prova_anterior` | _(sem COMMENT ON TABLE — significado não documentado)_ | 2 colunas | migration |
| `prova_hz503_asserts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 1 colunas | migration |
| `qr_attempts` | Historico de tentativas de conexao por QR Code. Escrita so pelo service_role (Edge Function); leitura por quem enxerga a conexao. Apagado aos 30 dias pelo job purge-qr-attempts. | 5 colunas | migration |
| `query_telemetry` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `queue_goals` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `queue_members` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `queue_positions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `queue_skill_requirements` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | migration |
| `queues` | Filas de atendimento (prioridade, tempo maximo de espera) usadas na distribuicao de contatos. | 14 colunas | migration |
| `rate_limit_configs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `rate_limit_logs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `reconnection_logs` | Historico das tentativas de reconexao por conexao. Escrito pelo sistema (service_role); retencao de 30 dias. | 6 colunas | migration |
| `reminders` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `role_permissions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `sales_deals` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | migration |
| `sales_pipeline_stages` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `saved_filters` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `scheduled_messages` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `scheduled_report_configs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `scheduled_reports` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `search_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | types.ts |
| `searchbox_budget_alert_cron` | [RLS-sem-policy: intencional] Controle de execução do cron searchbox-budget-alert. Só service_role via pg_cron. | 4 colunas | migration |
| `searchbox_budget_alert_emails` | [RLS-sem-policy: intencional] Destinatários dos alertas de budget. Só service_role via edge function searchbox-budget-alert. | 9 colunas | migration |
| `searchbox_usage_daily` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | types.ts |
| `security_acl_alerts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | types.ts |
| `security_alerts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `sicoob_contact_mapping` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `sla_alert_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `sla_alert_preferences` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `sla_configurations` | Configuracoes de SLA (minutos para primeira resposta e resolucao, prioridade, default). | 9 colunas | migration |
| `sla_rules` | _(sem COMMENT ON TABLE — significado não documentado)_ | 15 colunas | migration |
| `stickers` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `storage.buckets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 3 colunas | migration |
| `storage.objects` | _(sem COMMENT ON TABLE — significado não documentado)_ | 2 colunas | migration |
| `supabase_migrations.version_reservations` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `tags` | Etiquetas aplicaveis a contatos (contact_tags). | 1 colunas | migration |
| `talkx_alerts` | X033: alertas do motor Talk X. Um alerta aberto por (tipo, campanha); fechado sozinho quando o sinal deixa de disparar (resolved_at). Escrito por talkx_engine_alerts (service_role), lido por admin/supervisor. | 6 colunas | migration |
| `talkx_blacklist` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `talkx_campaign_events` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `talkx_campaign_metrics` | _(sem COMMENT ON TABLE — significado não documentado)_ | 17 colunas | types.ts |
| `talkx_campaign_optouts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | types.ts |
| `talkx_campaign_segments` | Talk X (X057): segmentos de uma campanha, em ordem (position 1..10). A ordem define qual segmento "ganha" quando o mesmo contato aparece em mais de um. | 7 colunas | migration |
| `talkx_campaigns` | _(sem COMMENT ON TABLE — significado não documentado)_ | 72 colunas | migration |
| `talkx_contact_attributes` | Talk X · projeção de atributos comerciais por contato (X037). Nesta leva só as colunas de compra/RFM (X040); as colunas de CRM entram por ALTER nas ondas de banco. | 23 colunas | migration |
| `talkx_conversions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `talkx_data_jobs` | Talk X · trilha de dados: catálogo dos jobs (X036). Leitura só admin/supervisor; escrita só service_role. | 7 colunas | migration |
| `talkx_ddd_regions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 3 colunas | migration |
| `talkx_delivery_log` | X033: log por destinatario do motor Talk X (etapa/tentativa/resultado/duracao). SEM telefone e SEM texto de mensagem — so ids, codigos e metricas. Escrita service_role (edge talkx-send), leitura admin/supervisor; expurgo de 30 dias pelo purge_talkx_expired_data. | 11 colunas | migration |
| `talkx_engine_health` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | types.ts |
| `talkx_help_views` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `talkx_link_clicks` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `talkx_links` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `talkx_optout_keywords` | Talk X (X029): palavras de opt-out configuraveis. match_mode exact = mensagem inteira; contains = palavra em qualquer posicao. | 5 colunas | migration |
| `talkx_recipients` | _(sem COMMENT ON TABLE — significado não documentado)_ | 34 colunas | migration |
| `talkx_segment_fields` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `talkx_segment_library_history` | Talk X (X103): retrato da biblioteca de segmentos por dia (chave counted_on). No mes corrente o dia e o de hoje; nos meses fechados e o ultimo dia do mes. Grava os MESMOS numeros dos KPIs (estoque total/crm360, uso real, entregues e conversoes). Leitura para admin/supervisor; escrita so pela rotina talkx_refresh_segment_library_history. | 7 colunas | migration |
| `talkx_segment_versions` | Talk X (X101): revisoes PUBLICADAS de um segmento (uma linha por publicacao). O gatilho talkx_segment_versions_trim mantem as 20 ultimas; reconstruir uma revisao antiga e o restore da etapa de publicacao. | 8 colunas | migration |
| `talkx_segments` | _(sem COMMENT ON TABLE — significado não documentado)_ | 22 colunas | migration |
| `talkx_settings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `talkx_storage_purge_queue` | [RLS-sem-policy: intencional] Fila de purge de storage do TalkX. Gerenciada pela edge function talkx-storage-purge (service_role). | 9 colunas | migration |
| `talkx_template_variants` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `talkx_template_versions` | Historico imutavel de templates Talk X; escrita somente pela RPC atomica canonica. | 15 colunas | migration |
| `talkx_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 23 colunas | migration |
| `talkx_test_send_claims` | [RLS-sem-policy: intencional] Claims para envios de teste do TalkX. Só service_role via talkx-send. | 5 colunas | migration |
| `talkx_test_sends` | _(sem COMMENT ON TABLE — significado não documentado)_ | 10 colunas | migration |
| `team_chat_media_acl_r2_db_020_rb` | [RLS-sem-policy: intencional] Tabela de rebuild para ACL de mídia do Team Chat. Só service_role durante scripts de migração. | 5 colunas | migration |
| `team_conversation_members` | Members of a team conversation with read/mute state | 9 colunas | migration |
| `team_conversations` | Chat conversations between team members (direct, group, department) | 11 colunas | migration |
| `team_message_reactions` | Emoji reactions on team messages (one per user per emoji per message) | 6 colunas | migration |
| `team_message_read_state` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | types.ts |
| `team_message_receipts` | Delivery and read receipts for team messages | 7 colunas | migration |
| `team_messages` | Messages within a team conversation | 15 colunas | migration |
| `training_sessions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `user_devices` | _(sem COMMENT ON TABLE — significado não documentado)_ | 13 colunas | migration |
| `user_roles` | Papeis por usuario (admin, supervisor, agent, special_agent). Alteracoes auditadas em audit_logs por trigger. | 4 colunas | migration |
| `user_service_accounts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 7 colunas | migration |
| `user_sessions` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `user_settings` | _(sem COMMENT ON TABLE — significado não documentado)_ | 39 colunas | migration |
| `vault.decrypted_secrets` | _(sem COMMENT ON TABLE — significado não documentado)_ | 2 colunas | migration |
| `voice_command_logs` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `voip_profile_credentials` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | types.ts |
| `warroom_alerts` | _(sem COMMENT ON TABLE — significado não documentado)_ | 9 colunas | migration |
| `webauthn_challenges` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `webhook_failures` | Dead-letter dos webhooks (endpoint, evento, payload truncado, erro, retries). ACL restrita a service_role. | 11 colunas | migration |
| `webhook_rate_limits` | _(sem COMMENT ON TABLE — significado não documentado)_ | 6 colunas | migration |
| `whatsapp_connection_queues` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | migration |
| `whatsapp_connections` | Instancias da Evolution GO conectadas (instance_id unico), status da sessao e configuracao de webhook. | 25 colunas | migration |
| `whatsapp_connections_agent` | _(sem COMMENT ON TABLE — significado não documentado)_ | 5 colunas | types.ts |
| `whatsapp_connections_public` | _(sem COMMENT ON TABLE — significado não documentado)_ | 4 colunas | types.ts |
| `whatsapp_connections_safe` | _(sem COMMENT ON TABLE — significado não documentado)_ | 20 colunas | types.ts |
| `whatsapp_flows` | _(sem COMMENT ON TABLE — significado não documentado)_ | 12 colunas | migration |
| `whatsapp_groups` | _(sem COMMENT ON TABLE — significado não documentado)_ | 11 colunas | migration |
| `whatsapp_templates` | _(sem COMMENT ON TABLE — significado não documentado)_ | 14 colunas | migration |
| `whisper_messages` | _(sem COMMENT ON TABLE — significado não documentado)_ | 8 colunas | migration |
| `ai_provider_type` (enum) | lovable_ai, openai_compatible, google_gemini, custom_webhook, custom_agent |  | banco |
| `app_role` (enum) | admin, supervisor, special_agent, agent |  | banco |
| `channel_type` (enum) | whatsapp, instagram, telegram, messenger, webchat, email |  | banco |
| `service_account_type` (enum) | google_sheets, google_docs, google_calendar, google_drive, dropbox |  | banco |
| `multiplix_dispatch_status` (enum) | draft, scheduled, sending, paused, completed, completed_with_failures, failed, cancelled |  | banco |
| `multiplix_recipient_status` (enum) | pending, sending, sent, delivered, read, failed, skipped, cancelled, outcome_unknown |  | banco |
| `multiplix_item_status` (enum) | pending, sending, sent, delivered, read, failed, failed_transient, skipped, cancelled, outcome_unknown |  | banco |
| `multiplix_block_type` (enum) | text, voice_ai, audio_recorded, file |  | banco |
| `multiplix_eligibility` (enum) | eligible, no_destination, suppressed, out_of_scope, media_pending, connection_unavailable, requires_template |  | banco |
| `talkx_blacklist_reason` (enum) | opt_out, bounce, spam, manual, other |  | banco |
| `CHAVE_TAREFAS_AGENDADAS` (TS) | 'admin-cron-jobs' |  | `src/components/admin/useTarefasAgendadas.ts` |
| `TriggerConfigInput` (TS) | keywords \| number \| text |  | `src/components/automations/automationConstants.ts` |
| `CanalDeSaida` (TS) | voip \| whatsapp |  | `src/components/calls/NewCallPanel.tsx` |
| `PERIODOS` (TS) | { value: 'hoje', label: 'Hoje' }, { value: 'ontem', label: 'Ontem' }, { value: '7d', label: '7 dias' }, { value: '30d', label: '30 dias' }, { value: 'mes', label: 'Este mês' }, { value: 'mes_passado', label: 'Mês passado' }, |  | `src/components/calls/periodos.ts` |
| `CatalogRailAlertId` (TS) | sync \| low_stock |  | `src/components/catalog/CatalogRail.tsx` |
| `CatalogRailFilterKey` (TS) | in_stock \| featured \| new_30d |  | `src/components/catalog/CatalogRail.tsx` |
| `CATALOG_RAIL_TIPS` (TS) | 'Use "Enviar" no card para mandar o produto direto no WhatsApp do contato.', 'Filtre por "Em destaque" para montar uma seleção pronta antes da reunião.', 'O filtro "Novidades" mostra o que entrou nos últimos 30 dias — bom para prospecção.', 'Estoque baixo aparece no rail: priorize esses brindes ante … |  | `src/components/catalog/CatalogRail.tsx` |
| `ProductBadgeKind` (TS) | out \| bestseller \| new \| featured \| instock |  | `src/components/catalog/catalogShared.tsx` |
| `MessageTemplate` (TS) | formal \| informal \| promo |  | `src/components/catalog/sendProductUtils.ts` |
| `SendMode` (TS) | product \| variant |  | `src/components/catalog/sendProductUtils.ts` |
| `EDGE_CONDITIONS` (TS) | { value: 'true', label: 'Verdadeiro' }, { value: 'false', label: 'Falso' }, |  | `src/components/chatbot/chatbotNodeConfig.ts` |
| `ContactViewMode` (TS) | grid \| list \| table \| map \| kanban \| analytics |  | `src/components/contacts/ContactViewSwitcher.tsx` |
| `AlertLevel` (TS) | ok \| warning \| critical |  | `src/components/copilot/SpeedToLeadAlert.tsx` |
| `TransparencyLabelVariant` (TS) | inline \| banner \| badge |  | `src/components/copilot/TransparencyLabel.tsx` |
| `SystemHealthGrade` (TS) | excelente \| bom \| atencao \| critico |  | `src/components/dashboard/systemHealth.ts` |
| `SystemHealthTone` (TS) | success \| info \| warning \| danger |  | `src/components/dashboard/systemHealth.ts` |
| `SystemHealthItemStatus` (TS) | ok \| warn \| bad |  | `src/components/dashboard/systemHealth.ts` |
| `SystemHealthItemId` (TS) | connections \| failures \| stalled |  | `src/components/dashboard/systemHealth.ts` |
| `GoalStatusTone` (TS) | success \| primary \| warning \| destructive |  | `src/components/dashboard/goals/goalsStatus.ts` |
| `TrendDirection` (TS) | up \| down \| neutral |  | `src/components/dashboard/metrics/types.ts` |
| `MetricSize` (TS) | sm \| md \| lg \| xl |  | `src/components/dashboard/metrics/types.ts` |
| `MetricVariant` (TS) | default \| success \| warning \| danger \| info |  | `src/components/dashboard/metrics/types.ts` |
| `MOTIVATION_PHRASES` (TS) | 'Disciplina hoje, resultados amanhã.', 'Cada conversa é uma oportunidade.', 'Constância vence intensidade.', 'Um passo de cada vez, sempre em frente.', 'Excelência é hábito, não acidente.', 'Foco no cliente, resultado garantido.', 'Hoje é um bom dia para superar ontem.', |  | `src/components/dashboard/overview/motivationPhrases.ts` |
| `SLARateTone` (TS) | success \| warning \| destructive |  | `src/components/dashboard/sla/slaRate.ts` |
| `FeatureState` (TS) | active \| disabled |  | `src/components/docs/featuresSectionsData.ts` |
| `AchievementType` (TS) | fast_response \| streak \| first_message \| resolution \| perfect_rating \| level_up \| daily_goal \| speed_demon \| achievement |  | `src/components/gamification/AchievementToast.tsx` |
| `GameType` (TS) | speed-typing \| quiz \| response-match \| emoji-decode |  | `src/components/gamification/miniGamesData.ts` |
| `MediaVolumeControlVariant` (TS) | bubble \| overlay \| sidebar |  | `src/components/inbox/MediaVolumeControl.tsx` |
| `TransferTargetType` (TS) | agent \| queue |  | `src/components/inbox/TransferDialog.tsx` |
| `ResultType` (TS) | message \| contact \| transcription \| action \| crm |  | `src/components/inbox/useGlobalSearchData.ts` |
| `DateFilter` (TS) | all \| today \| 7days \| 30days \| 90days |  | `src/components/inbox/useGlobalSearchData.ts` |
| `MediaTypeFilter` (TS) | all \| text \| image \| video \| audio \| document \| link |  | `src/components/inbox/useGlobalSearchData.ts` |
| `AnalysisPeriod` (TS) | all \| last_interaction \| today \| 3d \| 7d \| 14d \| 30d \| 90d \| custom |  | `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` |
| `ConversationTab` (TS) | chat \| files \| ia \| crm \| orders \| history \| tasks \| notes |  | `src/components/inbox/chat/ConversationTabs.tsx` |
| `DialogKey` (TS) | quickReplies \| slashCommands \| transferDialog \| scheduleDialog \| callDialog \| globalSearch \| chatSearch \| interactiveBuilder \| forwardDialog \| locationPicker \| aiAssistant \| catalogDirect \| whisper \| templatesWithVars \| realtimeTranscription \| closeDialog |  | `src/components/inbox/chat/dialogKeys.ts` |
| `ActiveTool` (TS) | chatSearch \| objections \| university \| aiAssistant \| summary |  | `src/components/inbox/chat/dialogKeys.ts` |
| `SendTimelineState` (TS) | done \| current \| pending \| error |  | `src/components/inbox/chat/messageSendTimeline.ts` |
| `EstadoDeEnvio` (TS) | queued \| inFlight \| failed |  | `src/components/inbox/chat/messageSendTimeline.ts` |
| `MorphState` (TS) | idle \| loading \| success \| error |  | `src/components/inbox/chat/motion/MorphButton.tsx` |
| `MotionTone` (TS) | info \| primary \| success \| warning \| destructive \| whatsapp |  | `src/components/inbox/chat/motion/tone.ts` |
| `StoryMediaKind` (TS) | image \| video \| text |  | `src/components/inbox/contact-details/storyUtils.ts` |
| `SidebarSectionTone` (TS) | blue \| purple \| green |  | `src/components/inbox/contact-details/sidebar/SidebarSection.tsx` |
| `SinguDetailKind` (TS) | metaprograms \| fears \| decision \| budget \| influencers \| rapport \| objections |  | `src/components/inbox/contact-details/sidebar/SinguProfileDetailSheet.tsx` |
| `SIDEBAR_SECTIONS` (TS) | 'professional', 'personal', 'singu', 'intelligence', 'delivery' |  | `src/components/inbox/contact-details/sidebar/sidebarSections.ts` |
| `ReopenAction` (TS) | reopen \| unarchive |  | `src/components/inbox/conversation-list/ConversationReopenDialog.tsx` |
| `MainTab` (TS) | open \| resolved \| search |  | `src/components/inbox/conversation-list/StatusChips.tsx` |
| `SubTab` (TS) | attending \| waiting |  | `src/components/inbox/conversation-list/StatusChips.tsx` |
| `ChipTab` (TS) | all \| unread \| attending \| waiting \| resolved \| archived |  | `src/components/inbox/conversation-list/StatusChips.tsx` |
| `SearchStatus` (TS) | idle \| typing \| loading \| ok \| empty \| error \| paused |  | `src/components/inbox/location-picker/useAddressAutocomplete.ts` |
| `LocationOrigin` (TS) | suggest \| forward \| click \| gps |  | `src/components/inbox/location-picker/useLocationPicker.ts` |
| `FileThumbSize` (TS) | card \| row \| cell |  | `src/components/inbox/tabs/FileThumb.tsx` |
| `KpiTone` (TS) | blue \| green \| purple \| yellow \| red |  | `src/components/inbox/tabs/KpiStrip.tsx` |
| `SenderAvatarSize` (TS) | sm \| md |  | `src/components/inbox/tabs/SenderAvatar.tsx` |
| `DocumentFamily` (TS) | pdf \| sheet \| doc \| ppt \| archive \| generic |  | `src/components/inbox/tabs/fileDisplay.ts` |
| `GlowToken` (TS) | primary \| success \| warning \| info \| muted |  | `src/components/inbox/tabs/journey/motion/presets.ts` |
| `TimePeriod` (TS) | 1h \| 6h \| 12h \| 24h \| 7d |  | `src/components/monitoring/hooks/types.ts` |
| … +347 linhas — lista completa em `context.json` | | | |

## Dados de referência (seed — planos, categorias, perfis fixos)

| Tabela | Colunas | Valores | Origem |
|---|---|---|---|
| `goals_configurations` | `profile_id, goal_type, daily_target, weekly_target, monthly_target, is_active` | `(NEW.id, 'messages_sent', CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 10 ELSE 50 END, CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 50 ELSE 250 END, CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 200 ELSE 1000 END, true), (NEW.id, 'contacts_handled', CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 3 ELSE 10 END, CASE WHEN NEW.role IN ('admin', 'supervisor') THEN 15 ELSE 50 END, …` | `supabase/migrations/20260925190001_dashboard_e42_seed_goals_by_role.sql` |
| `permissions` | `name, description, category` | `('multiplix.audience.suppliers', 'Multiplix: enviar para fornecedores', 'multiplix'), ('multiplix.audience.carriers', 'Multiplix: enviar para transportadoras', 'multiplix'), ('multiplix.audience.customers.own', 'Multiplix: enviar para a propria carteira de clientes', 'multiplix'), ('multiplix.audience.customers.all', 'Multiplix: enviar para todos os clientes', 'multiplix'), ('multiplix.audience.ad …` | `supabase/migrations/20260926150000_seed_multiplix_audience_permissions.sql` |

## Auditoria de consistência (código × schema) — trate como NÃO VERIFICADO

> `status`: inclui estados só de UI/realtime (ex.: `uploading`, `SUBSCRIBED`) que nunca vão ao banco — confira o arquivo antes de concluir que falta valor no enum.

| Tipo | Problema | Onde |
|---|---|---|
| status | valor `opt_in` para `consent_status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/adapters/evolutionAdapter.ts` |
| status | valor `required` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/auth/ProtectedRoute.tsx` |
| status | valor `ativo` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/crm360/CompanyFormDialog.tsx` |
| status | valor `uploading` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/inbox/FileUploader.tsx`<br>`escreve:src/components/inbox/useFileUploadLogic.ts` |
| status | valor `SUBSCRIBED` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/inbox/collaboration/ViewersIndicator.tsx`<br>`compara:src/hooks/analytics/useRealtimeDashboard.ts`<br>`compara:src/hooks/chat/useTypingPresence.ts`<br>`compara:src/hooks/communication/useAudioMemes.ts` |
| status | valor `demo` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/integrations/IntegrationsHub.tsx`<br>`escreve:src/components/integrations/IntegrationsHub.tsx` |
| status | valor `verified` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/mfa/MFASettings.tsx`<br>`compara:src/components/mfa/MFAVerify.tsx`<br>`compara:src/components/security/SecurityOverview.tsx`<br>`compara:src/components/security/SecuritySettingsPanel.tsx` |
| status | valor `testing` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/monitoring/MonitoringConnectionsList.tsx`<br>`compara:src/components/monitoring/MonitoringWebhookPanel.tsx`<br>`escreve:src/components/monitoring/hooks/useMonitoringActions.ts` |
| status | valor `pending_setup` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/omnichannel/OmnichannelInbox.tsx`<br>`compara:src/components/omnichannel/OmnichannelManager.tsx`<br>`escreve:src/components/omnichannel/OmnichannelManager.tsx` |
| status | valor `qr_pending` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/omnichannel/OmnichannelInbox.tsx`<br>`compara:supabase/functions/_shared/evolution-webhook-handlers.ts`<br>`compara:supabase/functions/connection-health-check/index.ts`<br>`escreve:supabase/functions/_shared/evolution-webhook-handlers.ts` |
| status | valor `paid` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/payments/PaymentLinksView.tsx` |
| status | valor `unmeasured` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/components/security/SecurityOverview.tsx` |
| status | valor `on` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/security/SecurityOverview.tsx` |
| status | valor `off` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/security/SecurityOverview.tsx` |
| status | valor `enabled` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/security/SecuritySettingsPanel.tsx`<br>`escreve:src/components/security/SecuritySettingsPanel.tsx` |
| status | valor `fallback` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/settings/ai-providers/AIProviderHealthPanel.tsx`<br>`compara:supabase/functions/_shared/ai-usage.ts` |
| status | valor `suprimido` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/talkx/TalkXSuppression.tsx` |
| status | valor `published` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| status | valor `unverified` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/auth/useMFA.ts` |
| status | valor `won` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/chat/useConversationHistoryTimeline.ts`<br>`compara:src/hooks/crm/useContactCrm360.ts`<br>`compara:src/lib/journey/mappers.ts` |
| status | valor `lost` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/chat/useConversationHistoryTimeline.ts`<br>`compara:src/lib/journey/mappers.ts` |
| status | valor `CHANNEL_ERROR` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/communication/useAudioMemes.ts`<br>`compara:src/hooks/realtime/useSupabaseRealtime.ts`<br>`compara:src/hooks/team-chat/useTeamConversations.ts`<br>`compara:src/hooks/team-chat/useTeamMessageReactions.ts` |
| status | valor `TIMED_OUT` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/communication/useAudioMemes.ts`<br>`compara:src/hooks/realtime/useSupabaseRealtime.ts`<br>`compara:src/hooks/team-chat/useTeamConversations.ts`<br>`compara:src/hooks/team-chat/useTeamMessageReactions.ts` |
| status | valor `offer` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/communication/useIncomingCallListener.ts`<br>`compara:supabase/functions/_shared/notification-events.ts` |
| status | valor `not-found` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/hooks/inbox/useRealtimeInbox.ts` |
| status | valor `block` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/integrations/useEvolutionApi.ts`<br>`escreve:src/hooks/integrations/useEvolutionApi.ts` |
| status | valor `segstatus` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:src/hooks/integrations/useTalkXSegments.ts` |
| status | valor `fulfilled` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/integrations/useWhatsAppStatus.ts`<br>`compara:src/lib/commandPaletteSearch.ts`<br>`compara:supabase/functions/gmail-cron-sync/index.ts` |
| status | valor `CLOSED` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/realtime/useSupabaseRealtime.ts` |
| status | valor `string` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/calls/terminoRemoto.ts`<br>`compara:src/services/outbound-message.service.ts`<br>`compara:supabase/functions/_shared/evolution-webhook-handlers.ts`<br>`compara:supabase/functions/elevenlabs-webhook/index.ts` |
| status | valor `request_error` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:supabase/functions/_shared/ai-usage.ts` |
| status | valor `unblock` para `status` usado no código não existe em nenhum enum do banco/TS | `compara:supabase/functions/_shared/evolution-go-routes.ts` |
| status | valor `approved_email_failed` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/approve-password-reset/index.ts` |
| status | valor `unhealthy` para `status` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/health/index.ts` |
| status | valor `suspended` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/calls/IncomingCallAlert.tsx`<br>`compara:src/components/monitoring/hooks/useMonitoringNotifications.ts`<br>`compara:src/hooks/chat/useTeamChatNotifications.ts`<br>`compara:src/lib/mediaVolumeElement.ts` |
| status | valor `object` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/email/EmailChatInbox.tsx`<br>`compara:src/hooks/system/useNavigationHistory.ts`<br>`compara:src/lib/postLoginRedirect.ts` |
| status | valor `Registered` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/sip/useSipConnection.ts` |
| status | valor `Unregistered` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/sip/useSipConnection.ts` |
| status | valor `Terminated` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/sip/useSipConnection.ts`<br>`compara:src/lib/calls/adapters/CallEngine.ts` |
| status | valor `SUBSCRIBED` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/system/useDiagnosticsData.ts` |
| status | valor `CHANNEL_ERROR` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/system/useDiagnosticsData.ts` |
| status | valor `TIMED_OUT` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/system/useDiagnosticsData.ts` |
| status | valor `CLOSED` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/system/useDiagnosticsData.ts` |
| status | valor `Establishing` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/calls/adapters/CallEngine.ts` |
| status | valor `Established` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/calls/adapters/CallEngine.ts`<br>`compara:src/lib/calls/adapters/SipCallAdapter.ts` |
| status | valor `confirmed` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:supabase/functions/_shared/effect-reconcile.ts`<br>`escreve:supabase/functions/_shared/effect-reconcile.ts` |
| status | valor `unconfirmed` para `state` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/_shared/effect-reconcile.ts` |
| status | valor `input_error` para `state` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/classify-emoji/index.ts`<br>`escreve:supabase/functions/classify-sticker/index.ts` |
| status | valor `provider_error` para `state` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/classify-emoji/index.ts`<br>`escreve:supabase/functions/classify-sticker/index.ts` |
| status | valor `low_confidence` para `state` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/classify-emoji/index.ts`<br>`escreve:supabase/functions/classify-sticker/index.ts` |
| status | valor `unexpected_error` para `state` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/classify-emoji/index.ts`<br>`escreve:supabase/functions/classify-sticker/index.ts` |
| status | valor `string` para `state` usado no código não existe em nenhum enum do banco/TS | `compara:supabase/functions/evolution-api/index.ts` |
| status | valor `selectContact` para `step` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/catalog/CatalogBulkSendDialog.tsx`<br>`compara:src/components/catalog/SendProductDialog.tsx`<br>`compara:src/components/catalog/useSendProduct.ts` |
| status | valor `configure` para `step` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/catalog/SendProductDialog.tsx`<br>`escreve:src/components/catalog/useSendProduct.ts` |
| status | valor `intro` para `step` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/mfa/MFAEnroll.tsx` |
| status | valor `qr` para `step` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/mfa/MFAEnroll.tsx` |
| status | valor `stop` para `step` usado no código não existe em nenhum enum do banco/TS | `compara:supabase/functions/talkx-send/index.ts` |
| status | valor `loaded` para `stage` usado no código não existe em nenhum enum do banco/TS | `compara:src/components/catalog/catalogShared.tsx`<br>`escreve:src/components/catalog/catalogShared.tsx` |
| status | valor `string` para `stage` usado no código não existe em nenhum enum do banco/TS | `compara:src/lib/mapboxToken.ts` |
| status | valor `rpc_error` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/_shared/ai-budget.ts` |
| status | valor `no_rows` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/_shared/ai-budget.ts` |
| status | valor `bad_shape` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/_shared/ai-budget.ts` |
| status | valor `exception` para `stage` usado no código não existe em nenhum enum do banco/TS | `escreve:supabase/functions/_shared/ai-budget.ts` |
| status | valor `string` para `call_status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/communication/useIncomingCallListener.ts` |
| status | valor `string` para `transcription_status` usado no código não existe em nenhum enum do banco/TS | `compara:supabase/functions/ai-transcribe-audio/index.ts` |
| status | valor `string` para `connection_status` usado no código não existe em nenhum enum do banco/TS | `compara:src/hooks/integrations/useTalkXServerResumePrecheck.ts` |
| coluna | coluna `company_id` usada no código não existe no schema de `contacts` |  |
| coluna | coluna `company` usada no código não existe no schema de `talkx_blacklist` |  |
| coluna | coluna `reason_code` usada no código não existe no schema de `talkx_blacklist` |  |
| tabela | tabela `a` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `alem_do_limite` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-rotas.unit.mjs` |
| tabela | tabela `audit_log` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| tabela | tabela `avatars` usada no código não existe nas migrations/types do repo | `src/components/admin/useAdminData.ts`<br>`src/components/settings/AvatarUpload.tsx` |
| tabela | tabela `carriers` usada no código não existe nas migrations/types do repo | `supabase/functions/crm-integration/index.ts` |
| tabela | tabela `categories` usada no código não existe nas migrations/types do repo | `supabase/functions/promogifts-catalog/index.ts` |
| tabela | tabela `coisas` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-rotas.unit.mjs` |
| tabela | tabela `companies` usada no código não existe nas migrations/types do repo | `supabase/functions/crm-integration/index.ts` |
| tabela | tabela `company_addresses` usada no código não existe nas migrations/types do repo | `supabase/functions/crm-integration/index.ts` |
| tabela | tabela `company_social_media` usada no código não existe nas migrations/types do repo | `supabase/functions/crm-integration/index.ts` |
| tabela | tabela `contact_phones` usada no código não existe nas migrations/types do repo | `supabase/functions/crm-integration/index.ts` |
| tabela | tabela `contatos` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-banco.unit.mjs` |
| tabela | tabela `customers` usada no código não existe nas migrations/types do repo | `supabase/functions/crm-integration/index.ts` |
| tabela | tabela `dashboard_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `de_outra_feature` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-rotas.unit.mjs` |
| tabela | tabela `emails` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `fantasma` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `fixture_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `fotos` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-rotas.unit.mjs` |
| tabela | tabela `ghost_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `ignorada` usada no código não existe nas migrations/types do repo | `scripts/ci/gerar-matriz-edge-tabela.unit.mjs` |
| tabela | tabela `inventado` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| tabela | tabela `mv` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| tabela | tabela `nao_e_da_feature` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-rotas.unit.mjs` |
| tabela | tabela `nao_existe` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| tabela | tabela `neta_da_outra_feature` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-rotas.unit.mjs` |
| tabela | tabela `nova` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| tabela | tabela `outra` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-banco.unit.mjs` |
| tabela | tabela `payments` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `product_variants` usada no código não existe nas migrations/types do repo | `supabase/functions/promogifts-catalog/index.ts` |
| tabela | tabela `runtime_table` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `shared_nao_conta` usada no código não existe nas migrations/types do repo | `scripts/ci/gerar-matriz-edge-tabela.unit.mjs` |
| tabela | tabela `so_no_teste` usada no código não existe nas migrations/types do repo | `scripts/ci/inventario-rotas.unit.mjs` |
| tabela | tabela `so_teste` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `suppliers` usada no código não existe nas migrations/types do repo | `supabase/functions/crm-integration/index.ts`<br>`supabase/functions/promogifts-catalog/index.ts` |
| tabela | tabela `t` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs`<br>`scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| tabela | tabela `t1` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs`<br>`scripts/ci/inventario-rotas.unit.mjs` |
| tabela | tabela `tabela` usada no código não existe nas migrations/types do repo | `scripts/ci/gerar-matriz-edge-tabela.mjs`<br>`scripts/inventario/gerar-banco.mjs`<br>`scripts/inventario/gerar-repo.mjs` |
| tabela | tabela `tabela_viva` usada no código não existe nas migrations/types do repo | `scripts/ci/check-remocoes-destrutivas.unit.mjs` |
| tabela | tabela `tools_runtime` usada no código não existe nas migrations/types do repo | `scripts/ai-context/gerar.unit.mjs` |
| tabela | tabela `tx` usada no código não existe nas migrations/types do repo | `scripts/ai-context/cenarios.mjs` |
| tabela | tabela `v` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| tabela | tabela `w_novo` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| tabela | tabela `x` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs`<br>`scripts/db-audit/supabase-usage-guard.mjs` |
| tabela | tabela `x_novo` usada no código não existe nas migrations/types do repo | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| rls | `ai_jobs`: RLS ligado sem nenhuma política → só service_role acessa |  |
| rls | `channel_connections_safe`: acessada do front (2 arquivo(s)) sem RLS (não encontrado) | `src/components/omnichannel/OmnichannelInbox.tsx`<br>`src/components/omnichannel/OmnichannelManager.tsx` |
| rls | `gmail_oauth_states`: RLS ligado sem nenhuma política → só service_role acessa |  |
| rls | `link_preview_cache`: RLS ligado sem nenhuma política → só service_role acessa |  |
| rls | `messages`: front faz DELETE mas nenhuma política RLS permite DELETE → vai falhar/retornar vazio para usuários | `src/components/monitoring/hooks/useMonitoringActions.ts` |
| rls | `password_reset_requests_safe`: acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/hooks/security/usePasswordResetRequests.ts` |
| rls | `query_telemetry`: front faz SELECT mas nenhuma política RLS permite SELECT → vai falhar/retornar vazio para usuários | `src/pages/AdminTelemetriaPage.tsx` |
| rls | `talkx_campaign_metrics`: acessada do front (2 arquivo(s)) sem RLS (não encontrado) | `src/hooks/integrations/useTalkXInsights.ts`<br>`src/hooks/integrations/useTalkXTemplatesConversion.ts` |
| rls | `talkx_test_send_claims`: RLS ligado sem nenhuma política → só service_role acessa |  |
| rls | `team_message_read_state`: acessada do front (1 arquivo(s)) sem RLS (não encontrado) | `src/hooks/team-chat/useTeamReadState.ts` |
| rls | `whatsapp_connections_safe`: acessada do front (2 arquivo(s)) sem RLS (não encontrado) | `src/components/omnichannel/OmnichannelManager.tsx`<br>`src/services/evolution.service.ts` |
| rls | `whisper_messages`: front faz UPDATE mas nenhuma política RLS permite UPDATE → vai falhar/retornar vazio para usuários | `src/components/inbox/WhisperMode.tsx` |
| edge | edge function `dashboard-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `edge-a` invocada mas não existe em supabase/functions/ | `scripts/ci/inventario-rotas.unit.mjs` |
| edge | edge function `fixture-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `ghost-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `inexistente` invocada mas não existe em supabase/functions/ | `scripts/ai-context/cenarios.mjs` |
| edge | edge function `orphan-fn` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `other` invocada mas não existe em supabase/functions/ | `scripts/ai-context/cenarios.mjs` |
| edge | edge function `runtime-fn` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `runtime-missing` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| edge | edge function `tools-edge` invocada mas não existe em supabase/functions/ | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `anon` chamada mas não definida nas migrations/types | `supabase/tests/admin_unlock_login_autorizacao.sql` |
| rpc | RPC `authenticated` chamada mas não definida nas migrations/types | `supabase/tests/admin_unlock_login_autorizacao.sql` |
| rpc | RPC `dashboard_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `demo` chamada mas não definida nas migrations/types | `scripts/supabase_snapshot/test_snapshot.py` |
| rpc | RPC `f` chamada mas não definida nas migrations/types | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| rpc | RPC `fixture_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `fn` chamada mas não definida nas migrations/types | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs`<br>`scripts/supabase_snapshot/snapshot.py` |
| rpc | RPC `fn_servico` chamada mas não definida nas migrations/types | `scripts/ci/inventario-rotas.unit.mjs` |
| rpc | RPC `get_companies_by_phones_batch` chamada mas não definida nas migrations/types | `supabase/functions/crm-integration/index.ts` |
| rpc | RPC `get_contact_360_by_phone` chamada mas não definida nas migrations/types | `scripts/ci/crm-integration-contract.unit.mjs`<br>`supabase/functions/crm-integration/index.ts` |
| rpc | RPC `ghost_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `log_event` chamada mas não definida nas migrations/types | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| rpc | RPC `multiplix_count_audience` chamada mas não definida nas migrations/types | `supabase/functions/multiplix-audience/index.ts`<br>`supabase/functions/multiplix-dispatch/actions/audience.ts`<br>`tests/contracts/multiplix-audience.contract.test.ts` |
| rpc | RPC `multiplix_list_ramos` chamada mas não definida nas migrations/types | `supabase/functions/multiplix-audience/index.ts`<br>`tests/contracts/multiplix-audience.contract.test.ts` |
| rpc | RPC `multiplix_list_ufs` chamada mas não definida nas migrations/types | `supabase/functions/multiplix-audience/index.ts`<br>`tests/contracts/multiplix-audience.contract.test.ts` |
| rpc | RPC `multiplix_resolve_recipients` chamada mas não definida nas migrations/types | `supabase/functions/multiplix-audience/index.ts`<br>`supabase/functions/multiplix-dispatch/actions/audience.ts`<br>`tests/contracts/multiplix-audience.contract.test.ts` |
| rpc | RPC `multiplix_search_audience` chamada mas não definida nas migrations/types | `supabase/functions/multiplix-audience/index.ts`<br>`supabase/functions/multiplix-dispatch/actions/audience.ts`<br>`tests/contracts/multiplix-audience.contract.test.ts` |
| rpc | RPC `nome` chamada mas não definida nas migrations/types | `scripts/supabase_snapshot/snapshot.py` |
| rpc | RPC `r1` chamada mas não definida nas migrations/types | `scripts/ai-context/cenarios.mjs`<br>`scripts/ci/inventario-rotas.unit.mjs` |
| rpc | RPC `record_away_message` chamada mas não definida nas migrations/types | `supabase/functions/_shared/evolution-webhook-messages.ts` |
| rpc | RPC `runtime_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `same_day_rpc` chamada mas não definida nas migrations/types | `scripts/ci/supabase-usage-guard-forward-projection.unit.mjs` |
| rpc | RPC `should_send_away_message` chamada mas não definida nas migrations/types | `supabase/functions/_shared/evolution-webhook-messages.ts` |
| rpc | RPC `sync_interaction_from_zapp` chamada mas não definida nas migrations/types | `scripts/ci/crm-integration-contract.unit.mjs`<br>`supabase/functions/crm-integration/index.ts` |
| rpc | RPC `talkx_campaign_resume_precheck` chamada mas não definida nas migrations/types | `src/hooks/integrations/useTalkXServerResumePrecheck.ts` |
| rpc | RPC `tools_rpc` chamada mas não definida nas migrations/types | `scripts/ai-context/gerar.unit.mjs` |
| rpc | RPC `x` chamada mas não definida nas migrations/types | `scripts/inventario/gerar-rotas.mjs` |
| rpc | RPC `y` chamada mas não definida nas migrations/types | `scripts/db-audit/supabase-usage-guard.mjs` |
| rpc | RPC `zapp_catalog_stats` chamada mas não definida nas migrations/types | `supabase/functions/promogifts-catalog/index.ts` |
| dinâmico | 4 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `scripts/ci/inventario-rotas.unit.mjs` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `scripts/inventario/gerar-banco.mjs` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `scripts/regras_negocio/generate.py` |
| dinâmico | 3 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/__tests__/rls-boundary.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/admin/useAdminData.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/schedule/__tests__/ScheduleCalendarView.a11y.test.tsx` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/schedule/__tests__/ScheduleCalendarView.agenda.test.tsx` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/security/__tests__/AuditLogDashboard.hoje-janela24h.test.tsx` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/security/__tests__/AuditLogDashboard.test.tsx` |
| dinâmico | 8 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/settings/media-library/useMediaLibrary.ts` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/settings/media-library/useMediaUpload.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/talkx/useTalkXMediaUpload.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/__tests__/useScheduledMessages.test.tsx` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/chat/useContactMedia.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/chat/__tests__/useLatestAnalysis.test.tsx` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/communication/useAudioPlayer.ts` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/crm/useAgentPresence.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/integrations/useKnowledgeBase.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/integrations/__tests__/useTalkXInsights.defeito-223.test.tsx` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/sticker-picker/__tests__/useStickerPicker.recentes.test.tsx` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/storage/useResolvedStorageUrl.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/system/useGeoBlocking.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/hooks/team-chat/uploadTeamMedia.ts` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/lib/supabaseHelpers.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/services/contact.service.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `src/test/mocks/tarefas.ts` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/_shared/effect-reconcile.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/_shared/evolution-api-proxy.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/_shared/evolution-types.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/_shared/rate-limit-log.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/ai-kb-ingest/index.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/crm-integration/index.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/external-db-bridge/index.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/external-db-bridge/index.ts` |
| dinâmico | 2 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/external-db-proxy/index.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/migrate-media-storage/index.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/multiplix-dispatch/actions/lifecycle.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/multiplix-send/index.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/multiplix-voices/index.ts` |
| dinâmico | 6 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/talkx-ai/index.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/talkx-send/process-recipient.ts` |
| dinâmico | 5 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/talkx-storage-purge/index.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `supabase/functions/webauthn/index.test.ts` |
| dinâmico | 1 chamada(s) `.from(variável)` — tabela só conhecida em runtime | `tests/contracts/ai-vision-classifiers-mock.contract.test.ts` |
| segurança | função `talkx_increment_delivered` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/migrations/20260911120000_talkx_e87_external_id_delivered.sql` |
| segurança | função `z296_hits` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/tests/catalog_rate_limit_policy_confiavel.sql` |
| segurança | função `z296_aplicar_rollback` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/tests/catalog_rate_limit_policy_confiavel.sql` |
| segurança | função `zz_prova_secd` é SECURITY DEFINER sem `set search_path` (risco de escalação) | `supabase/tests/security_acl_alerts_monitor.sql` |
| webhook | edge function `multiplix-voices` processa eventos de webhook sem sinal de idempotência (evento duplicado = efeito duplicado) | `supabase/functions/multiplix-voices/index.ts` |

## Lacunas — o que este contexto NÃO consegue responder (perguntas para o dono do negócio)

- `conversation_analyses.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `conversation_tasks.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `csat_surveys.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `email_threads.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `followup_executions.current_step` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `followup_executions.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `messages.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `messages.transcription_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `sales_deals.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `scheduled_messages.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_recipients.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `contacts.consent_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `contacts.conversation_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `contacts.presence_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `contacts.state` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `gmail_accounts.sync_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `whatsapp_connections.health_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `whatsapp_connections.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `whatsapp_flows.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `followup_steps.step_order` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `knowledge_base_articles.embedding_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `channel_connections.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `whatsapp_templates.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `knowledge_base_files.processing_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `training_sessions.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `connection_health_logs.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_campaigns.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_campaigns.draft_step` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `number_reputation.warmup_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `ai_usage_logs.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `ops.hermes_change_log.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_template_versions.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_delivery_log.http_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `gmail_oauth_states.state` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `searchbox_budget_alert_emails.http_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_contact_attributes.state` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_contact_attributes.funnel_stage` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_test_sends.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_ddd_regions.state` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `message_attempts.provider_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `copilot_sessions.state_version` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `copilot_insights.state_version` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `copilot_objection_catalog.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `_zapp_mig133_log.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `channel_connections_safe.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `gmail_accounts_safe.sync_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `password_reset_requests_safe.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_campaign_metrics.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `talkx_engine_health.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `whatsapp_connections_agent.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `whatsapp_connections_public.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `whatsapp_connections_safe.health_status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- `whatsapp_connections_safe.status` é uma coluna de status sem enum/CHECK — os valores válidos e as transições permitidas não estão no banco.
- 173/234 tabelas sem `COMMENT ON TABLE` — o significado de negócio não está no schema: `ai_conversation_tags`, `calls`, `campaign_contacts`, `chatbot_executions`, `contact_custom_fields`, `contact_notes`, `conversation_analyses`, `conversation_closures`, `conversation_memory`, `conversation_snoozes`, `conversation_tasks`, `csat_surveys` …
- Há tabelas usadas no código sem migration no repo — o schema real pode ter sido alterado pelo painel.

## Regras manuais presentes

- `manual/regras.md`
