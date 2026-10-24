# Mapa do banco vivo — Zapp Web V2

Projeto canônico `tnnnlkbymytvtqngbbqh`, lido em 04/10/2026 via `zapp_db.py` (só leitura). Dados brutos em `dados/`. Nada foi alterado.

## 1. Resumo

| Item | Valor |
|---|---|
| Migrations no ledger × repo (origin/main) | 785 × 785 — **drift zero** |
| Tabelas public | 166 (109.8 MB) — 67 com dados, **99 vazias** |
| Linhas totais | 102661 |
| Tabelas sem RLS | 0 |
| RLS ligado sem policy (só service_role acessa) | ai_budget_reservations, ai_jobs, catalog_rate_limit_hits, catalog_rate_limits, edge_rate_limits, link_preview_cache, talkx_test_send_claims |
| Funções public | 317 (266 SECURITY DEFINER) |
| SECURITY DEFINER chamáveis por anon/authenticated (não-trigger) | 111 |

## 2. Achados desta camada (registrados, NÃO corrigidos)

| ID | Gravidade | Achado | Evidência |
|---|---|---|---|
| M-DB-01 | **P0** | Motor Talk X parado: cron `talkx-scheduler-1min` falha toda execução desde 04/10 03:07 (`DELETE FROM storage.objects` bloqueado por `storage.protect_delete`). Tick não isola o expurgo; alertas/sweep/fan-out não rodam. | seção 11.2 do caderno; R3-DELTA-006/007 |
| M-DB-02 | **P0 (segurança)** | `record_incoming_call_event` versão de 7 argumentos (com `p_direction`, migration T26 `20261002531230`) é SECURITY DEFINER, não checa chamador e é **executável por anon e authenticated** (a T26 não repetiu o REVOKE da versão de 6 argumentos). Permite gravar chamada/notificação para qualquer contato/conexão com a chave pública. Versão antiga (6 args) segue existindo, fechada. | `has_function_privilege`; migration 20260922220000 l.184–189 tem REVOKE só da assinatura antiga |
| M-DB-03 | P2 | `talkx_engine_cron_runs` executável por authenticated sem checagem de papel | = R3-DELTA-002, confirmado no vivo |
| M-DB-04 | P2 | 99 de 166 tabelas vazias: módulos sem uso real ou nunca ligados (Talk X inteiro, Multiplix inteiro, campanhas, chatbot, KB, deals, departamentos, templates…) | contagem exata por tabela |

### Candidatos a revisão: SECURITY DEFINER chamáveis por authenticated sem checagem óbvia de chamador no corpo
Heurística (procura auth.uid/role/is_admin/…); podem checar por outro helper. Revisar um a um na Fase M.

- `accept_department_invite(p_code text)` → jsonb
- `count_searchbox_sessions_this_month()` → integer
- `effective_role(_user_id uuid)` → app_role
- `find_or_create_direct_conversation(other_profile_id uuid)` → uuid
- `fn_list_audio_meme_categories()` → record
- `get_profile_role_for_check(p_user_id uuid)` → record
- `get_team_inbox()` → record
- `get_team_messages_page(p_conversation_id uuid, p_before_id uuid, p_limit integer)` → record
- `is_country_allowed(check_country_code text)` → boolean
- `is_country_blocked(check_country_code text)` → boolean
- `is_ip_blocked(check_ip text)` → boolean
- `is_ip_whitelisted(check_ip text)` → boolean
- `is_team_conversation_member(_user_id uuid, _conversation_id uuid)` → boolean
- `is_within_business_hours(connection_id uuid)` → boolean
- `leave_team_group(p_conversation_id uuid)` → jsonb
- `notify_searchbox_budget()` → integer
- **ANON** `record_incoming_call_event(p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text, p_should_notify boolean, p_direction text)` → record
- `remove_team_member(p_conversation_id uuid, p_profile_id uuid)` → jsonb
- `search_knowledge_base(search_query text, max_results integer)` → record
- `search_team_messages(p_conversation_id uuid, p_query text, p_limit integer)` → record
- `set_conversation_status(p_contact_id uuid, p_next text, p_reason text)` → void
- `set_team_member_pref(p_conversation_id uuid, p_is_muted boolean)` → void
- `talkx_engine_cron_runs(p_limit integer)` → record
- `talkx_engine_window_open(p_campaign_id uuid)` → boolean
- `toggle_team_reaction(p_message_id uuid, p_emoji text)` → jsonb
- `transfer_team_conversation_department(p_conversation_id uuid, p_to_department_id uuid)` → jsonb
- `user_has_permission(_user_id uuid, _permission_name text)` → boolean

## 3. Cron jobs (últimas 24 h)

| Job | Agenda | Execuções | OK | Falhas | Último OK | Última falha | Comando |
|---|---|---|---|---|---|---|---|
| ai-jobs-tick-1min | `1-59 * * * *` | 1416 | 1414 | 2 | 10-04 12:14 | job startup timeout | `select public.trigger_ai_jobs_tick()` |
| avatars-refresh | `7 * * * *` | 24 | 24 | 0 | 10-04 12:07 | - | ` SELECT net.http_post( url := 'https://tnnnlkbymytvtqngbbqh.supabase.c` |
| cleanup-edge-rate-limits | `7-52/15 * * * *` | 96 | 96 | 0 | 10-04 12:07 | - | `DELETE FROM public.edge_rate_limits WHERE updated_at < now() - interva` |
| cleanup-link-preview-cache | `12 3 * * *` | 1 | 1 | 0 | 10-04 03:12 | - | `SELECT public.cleanup_link_preview_cache()` |
| connection-health-check | `2-57/5 * * * *` | 288 | 288 | 0 | 10-04 12:12 | - | ` SELECT net.http_post( url := 'https://tnnnlkbymytvtqngbbqh.supabase.c` |
| expire-stale-agent-presence | `1-59/2 * * * *` | 720 | 720 | 0 | 10-04 12:13 | - | `SELECT public.expire_stale_agent_presence();` |
| gmail-incremental-sync | `0-55/5 * * * *` | 288 | 288 | 0 | 10-04 12:10 | - | `SELECT net.http_post( url:='https://tnnnlkbymytvtqngbbqh.supabase.co/f` |
| multiplix-send-trigger | `0-58/2 * * * *` | 720 | 719 | 1 | 10-04 12:14 | job startup timeout | `SELECT public.trigger_pending_multiplix_dispatches()` |
| searchbox-budget-alert | `0 12 * * *` | 1 | 1 | 0 | 10-04 12:00 | - | `SELECT public.notify_searchbox_budget(); SELECT net.http_post( url := ` |
| talkx-scheduler-1min | `* * * * *` | 1440 | 891 | 549 | 10-04 03:06 | ERROR: Direct deletion from storage tables is not allowed. Use the Storage API instead. HI | `SELECT public.trigger_talkx_engine_tick()` |
| tasks-notify-due | `* * * * *` | 1440 | 1439 | 1 | 10-04 12:14 | job startup timeout | `SELECT public.notify_due_tasks()` |
| vacuum-contacts-daily | `42 3 * * *` | 1 | 1 | 0 | 10-04 03:42 | - | `VACUUM ANALYZE public.contacts;` |
| vacuum-messages-post-expurgo | `20 3 2 9 *` | 0 | 0 | 0 | 09-02 03:00 | - | `VACUUM FULL ANALYZE public.messages;` |

## 4. Tabelas com dados (por tamanho)

| Tabela | Linhas | MB | Policies |
|---|---|---|---|
| email_messages | 2926 | 37.2 | 2 |
| messages | 53355 | 35.3 | 3 |
| audit_logs | 26723 | 12.4 | 4 |
| contacts | 3594 | 6.5 | 3 |
| email_attachments | 2502 | 4.0 | 2 |
| email_threads | 2185 | 1.9 | 3 |
| conversation_events | 3253 | 1.4 | 2 |
| conversation_sla | 1830 | 0.7 | 3 |
| connection_health_logs | 1956 | 0.6 | 3 |
| stickers | 971 | 0.5 | 4 |
| crm_sync_outbox | 465 | 0.4 | 1 |
| contact_deletion_audit | 486 | 0.2 | 4 |
| whatsapp_connections | 2 | 0.2 | 4 |
| ai_jobs | 159 | 0.2 | 0 |
| audio_memes | 542 | 0.2 | 4 |
| conversation_tasks | 1 | 0.2 | 4 |
| whatsapp_groups | 221 | 0.2 | 2 |
| warroom_alerts | 501 | 0.2 | 4 |
| message_reactions | 116 | 0.2 | 7 |
| conversation_closures | 18 | 0.2 | 2 |
| ai_usage_logs | 28 | 0.2 | 3 |
| catalog_rate_limit_hits | 199 | 0.2 | 0 |
| calls | 22 | 0.1 | 3 |
| agent_achievements | 109 | 0.1 | 2 |
| profiles | 11 | 0.1 | 6 |
| catalog_send_events | 1 | 0.1 | 2 |
| gmail_accounts | 1 | 0.1 | 4 |
| goals_configurations | 33 | 0.1 | 2 |
| login_attempts | 14 | 0.1 | 4 |
| reminders | 1 | 0.1 | 1 |
| notifications | 18 | 0.1 | 4 |
| team_messages | 2 | 0.1 | 4 |
| user_roles | 12 | 0.1 | 2 |
| security_alerts | 4 | 0.1 | 2 |
| talkx_template_versions | 5 | 0.1 | 1 |
| team_conversations | 2 | 0.1 | 4 |
| user_sessions | 13 | 0.1 | 4 |
| favorite_contacts | 1 | 0.1 | 4 |
| pinned_conversations | 9 | 0.1 | 4 |
| queue_members | 4 | 0.1 | 2 |
| team_conversation_members | 4 | 0.1 | 4 |
| agent_presence | 8 | 0.1 | 3 |
| ai_budget_reservations | 6 | 0.1 | 0 |
| catalog_rate_limits | 5 | 0.1 | 0 |
| edge_rate_limits | 56 | 0.1 | 0 |
| email_labels | 24 | 0.1 | 2 |
| performance_snapshots | 2 | 0.1 | 4 |
| talkx_templates | 5 | 0.1 | 4 |
| user_devices | 4 | 0.1 | 5 |
| whatsapp_flows | 1 | 0.1 | 2 |
| agent_stats | 11 | 0.1 | 3 |
| role_permissions | 60 | 0.1 | 2 |
| ai_providers | 4 | 0.0 | 4 |
| auto_close_config | 1 | 0.0 | 2 |
| feature_flags | 3 | 0.0 | 2 |
| geo_blocking_settings | 1 | 0.0 | 2 |
| global_settings | 6 | 0.0 | 2 |
| permissions | 29 | 0.0 | 2 |
| talkx_segments | 1 | 0.0 | 4 |
| user_settings | 6 | 0.0 | 3 |
| queues | 1 | 0.0 | 2 |
| rate_limit_configs | 5 | 0.0 | 2 |
| sales_pipeline_stages | 5 | 0.0 | 2 |
| sla_configurations | 3 | 0.0 | 2 |
| talkx_optout_keywords | 10 | 0.0 | 2 |
| talkx_settings | 16 | 0.0 | 2 |
| link_preview_cache_metrics | 89 | 0.0 | 2 |

## 5. Tabelas vazias (99)

`agent_skills`, `agent_visibility_grants`, `ai_conversation_tags`, `ai_model_prices`, `allowed_countries`, `audio_meme_favorites`, `automations`, `away_messages`, `blocked_countries`, `blocked_ips`, `business_hours`, `campaign_ab_variants`, `campaign_contacts`, `campaigns`, `catalog_favorites`, `channel_connections`, `channel_routing_rules`, `chatbot_executions`, `chatbot_flows`, `client_wallet_rules`, `contact_custom_fields`, `contact_identity_map`, `contact_notes`, `contact_purchases`, `conversation_analyses`, `conversation_memory`, `conversation_snoozes`, `crisis_room_alerts`, `crm_contact_links`, `csat_auto_config`, `csat_surveys`, `custom_emojis`, `deal_activities`, `department_audit_logs`, `department_invitations`, `department_invites`, `departments`, `entity_versions`, `followup_executions`, `followup_sequences`, `followup_steps`, `ip_whitelist`, `knowledge_base_articles`, `knowledge_base_files`, `link_preview_cache`, `message_templates`, `meta_capi_events`, `mfa_sessions`, `multiplix_audience_members`, `multiplix_audiences`, `multiplix_blocks`, `multiplix_delivery_items`, `multiplix_dispatches`, `multiplix_events`, `multiplix_recipients`, `multiplix_voice_assets`, `multiplix_voice_grants`, `nps_surveys`, `number_reputation`, `passkey_credentials`, `password_reset_requests`, `payment_links`, `playbooks`, `products`, `query_telemetry`, `queue_goals`, `queue_positions`, `queue_skill_requirements`, `rate_limit_logs`, `sales_deals`, `saved_filters`, `scheduled_messages`, `scheduled_report_configs`, `scheduled_reports`, `sicoob_contact_mapping`, `sla_rules`, `talkx_alerts`, `talkx_blacklist`, `talkx_campaign_events`, `talkx_campaign_segments`, `talkx_campaigns`, `talkx_conversions`, `talkx_delivery_log`, `talkx_link_clicks`, `talkx_links`, `talkx_recipients`, `talkx_template_variants`, `talkx_test_send_claims`, `team_message_reactions`, `team_message_receipts`, `training_sessions`, `user_service_accounts`, `voice_command_logs`, `webauthn_challenges`, `webhook_failures`, `webhook_rate_limits`, `whatsapp_connection_queues`, `whatsapp_templates`, `whisper_messages`

## 6. Lacunas desta camada
- Edge functions **implantadas** (versão/hash vs `deployment-manifest.json`, 73 no repo): sem acesso à Management API nesta sessão.
- Corpo vivo × corpo do arquivo de cada função: não comparado (ledger igual não prova corpo igual).
- Grants de tabela/coluna, views `security_invoker`, buckets de Storage e políticas de Storage: próximo passo.

## 7. Revisão das 27 funções candidatas (feita em 04/10)
**14 falso alarme** — checam o chamador por `current_profile_id()`, membership ou papel: `accept_department_invite`, `find_or_create_direct_conversation`, `get_team_inbox`, `get_team_messages_page`, `leave_team_group`*, `remove_team_member`*, `search_team_messages`, `set_conversation_status`, `set_team_member_pref`, `toggle_team_reaction`, `transfer_team_conversation_department`, `get_profile_role_for_check` (guarda no corpo), mais `record_talkx_campaign_lifecycle_event` (gatilho). *quebradas por TC-004.

**13 sem checagem de chamador (achados M-DB-05, P3 — vazamento de informação, sem escrita relevante):**
| Função | Risco |
|---|---|
| `effective_role(_user_id)`, `user_has_permission(_user_id, _permission)`, `is_team_conversation_member(_user_id, _conv)` | qualquer usuário logado consulta papel/permissão/membership de **outro** usuário (auxiliares de RLS expostas pela API) |
| `search_knowledge_base(query, n)` | SECURITY DEFINER ignora RLS da base de conhecimento (hoje vazia) |
| `talkx_engine_window_open(campaign)` | revela janela de envio de qualquer campanha |
| `count_searchbox_sessions_this_month()`, `notify_searchbox_budget()` | consumo do Searchbox; o segundo dispara notificação de orçamento quando chamado por qualquer logado |
| `is_country_allowed/blocked`, `is_ip_blocked/whitelisted`, `is_within_business_hours`, `fn_list_audio_meme_categories` | consultas de configuração; baixo impacto |
| `talkx_engine_cron_runs` | = M-DB-03 / R3-DELTA-002 |
Nenhuma das 13 é executável por `anon`. O único caso aberto a `anon` continua sendo M-DB-02.
