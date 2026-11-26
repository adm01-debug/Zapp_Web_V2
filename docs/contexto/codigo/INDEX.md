# Contexto do projeto para agentes de IA

GERADO AUTOMATICAMENTE por scripts/ai-context/gerar.mjs — não editar à mão; será sobrescrito.
Publicado em `docs/contexto/codigo/` na branch `contexto` (gerada, nunca abra PR dela) a cada push em `main` e a cada 10 minutos pelo workflow `contexto.yml`; índice único das três fontes em `docs/contexto/00-INDEX.md`. Gere local com `node scripts/ai-context/gerar.mjs`. Commit-base: `f5a9f52f258e86511f72a0ad8b5a27a88d14882d` (2026-11-26T15:52:52Z).

## Como usar (leia antes de planejar ou executar qualquer tarefa)
1. **Tela/rota/menu** → `rotas.json` (url/vista/menu → arquivo → hooks → tabelas → edges; `rotas_http_backend` para APIs) e `modulos.json` (módulo inteiro + dependências entre módulos).
2. **Hook/serviço/lógica** → `hooks.json`, `logica.json` (quem usa, o que toca, se tem teste).
3. **Edge function / serverless** → `edge-functions.json` (verify_jwt, tabelas, env, quem chama, órfãs).
4. **Banco** → `banco.json` (colunas, RLS, policies, índices, FKs, triggers, cron jobs, buckets, drift migration×types, uso no código) — visão do código; para o banco vivo use o MCP.
5. **Antes de criar arquivo** → `convencoes.json` (onde ficam as coisas, nomenclatura, alias), `componentes.json` (nomes duplicados, órfãos), `grafo.json` (hubs, ciclos de import) e `grafo-graphify.json` (grafo por AST: comunidades, símbolos mais chamados, comunidade de cada arquivo).
6. **CI/scripts/deploy/env/integrações/permissões/flags** → `ferramentas.json` e `scripts.json`.
7. **Antes de abrir PR** → `testes.json` (o que tem e não tem teste, onde os testes ficam), `baseline.json` (alertas, TODOs, hotspots, últimos commits).
Os JSONs são grandes: filtre com `grep`/`jq` pelo caminho/arquivo/tabela da sua tarefa; não carregue tudo.

## Stack
- linguagens: TypeScript (4570), Markdown (3988), SQL (3072), JSON (1939), JavaScript (524), Shell (256), Python (125), YAML (43)
- linguagem_principal: TypeScript
- framework: React
- backend_http: n/d
- bundler: Vite
- roteador: react-router
- banco: Supabase
- testes: vitest, playwright
- ui: tailwind, radix/shadcn
- estado: react-query
- gerenciador_pacotes: bun
- node: 24
- python: n/d
- deploy: vercel, compose/swarm
- monorepo: n/d
- pastas_fonte: src

## Números
| item | qtd |
|---|---|
| arquivos_total | 14883 |
| arquivos_codigo | 5215 |
| linhas_codigo | 966348 |
| rotas | 21 |
| rotas_http_backend | 11 |
| vistas_por_id | 55 |
| itens_menu | 61 |
| modulos | 149 |
| componentes | 950 |
| hooks | 531 |
| edge_functions | 94 |
| tabelas | 224 |
| migrations | 1161 |
| cron_jobs | 29 |
| testes | 2857 |
| workflows | 26 |
| scripts | 458 |
| docs_md | 3988 |

## Onde ficam as coisas
- telas: src/components (54), src/pages (21)
- componentes: src/components (912), src/pages (29), src/features (2)
- hooks: src/hooks (446), src/components (74), src/contexts (2)
- servicos_logica: src/lib (157), src/services (20), src/utils (8)
- testes: co-localizado (__tests__) (2129), outro (260), co-localizado (*.test) (203)
- edge_functions: supabase/functions
- migrations: supabase/migrations
- scripts: scripts/db-audit (309), scripts/ci (43), scripts/e2e-isolated (41)
- docs: docs (34), (raiz) (15), .github (1)
- nomenclatura: {"componentes":"PascalCase (91%)","hooks":"use + PascalCase","servicos":"camelCase (73%)","edge_functions":"kebab-case (96%)","tabelas":"snake_case (92%)"}
- instruções para agentes no repo: AGENTS.md, CLAUDE.md

## Módulos (menu → domínio)
| módulo | itens de menu | telas/rotas | arquivos | hooks locais | edges | tabelas |
|---|---|---|---|---|---|---|
| components/admin | 6 | 7 | 26 | 34 | 7 | 17 |
| components/agents | 1 | 1 | 5 | 23 | 3 | 9 |
| components/ai | 2 | 2 | 4 | 1 | 2 | 1 |
| components/auth | 0 | 0 | 6 | 15 | 2 | 5 |
| components/automations | 1 | 1 | 5 | 13 | 2 | 5 |
| components/calls | 1 | 1 | 31 | 44 | 4 | 13 |
| components/catalog | 2 | 2 | 24 | 40 | 3 | 10 |
| components/chatbot | 1 | 1 | 6 | 2 | 0 | 2 |
| components/compliance | 1 | 1 | 1 | 11 | 2 | 4 |
| components/connections | 1 | 1 | 15 | 29 | 4 | 15 |
| components/contacts | 1 | 1 | 53 | 61 | 6 | 16 |
| components/copilot | 0 | 0 | 23 | 33 | 2 | 6 |
| components/crm360 | 1 | 1 | 7 | 20 | 4 | 6 |
| components/dashboard | 3 | 3 | 74 | 66 | 3 | 24 |
| components/diagnostics | 1 | 1 | 2 | 2 | 1 | 4 |
| components/docs | 1 | 1 | 2 | 0 | 0 | 0 |
| components/effects | 0 | 0 | 5 | 3 | 0 | 0 |
| components/email | 1 | 1 | 8 | 24 | 3 | 14 |
| components/gamification | 1 | 1 | 10 | 16 | 2 | 6 |
| components/gmail | 1 | 1 | 6 | 15 | 2 | 8 |
| components/groups | 1 | 1 | 3 | 11 | 1 | 3 |
| components/inbox | 1 | 1 | 270 | 256 | 23 | 50 |
| components/integrations | 2 | 2 | 6 | 20 | 3 | 9 |
| components/knowledge | 1 | 1 | 1 | 4 | 1 | 2 |
| components/layout | 0 | 0 | 18 | 512 | 50 | 127 |
| components/meta-capi | 1 | 1 | 1 | 2 | 0 | 2 |
| components/mobile | 0 | 0 | 9 | 26 | 2 | 8 |
| components/monitoring | 1 | 1 | 23 | 26 | 6 | 8 |
| components/multiplix | 1 | 1 | 2 | 39 | 5 | 6 |
| components/notifications | 0 | 0 | 13 | 32 | 2 | 15 |
| components/nps | 1 | 1 | 1 | 2 | 0 | 2 |
| components/omnichannel | 2 | 2 | 4 | 188 | 21 | 52 |
| components/onboarding | 0 | 0 | 6 | 12 | 2 | 6 |
| components/performance | 1 | 1 | 9 | 400 | 35 | 101 |
| components/queues | 2 | 2 | 16 | 17 | 0 | 9 |
| components/reports | 1 | 1 | 10 | 18 | 3 | 9 |
| components/schedule | 1 | 1 | 1 | 17 | 2 | 7 |
| components/security | 2 | 2 | 27 | 35 | 6 | 18 |
| components/settings | 2 | 2 | 45 | 48 | 8 | 30 |
| components/talkx | 1 | 2 | 113 | 83 | 7 | 25 |
| components/tasks | 1 | 1 | 52 | 27 | 2 | 11 |
| components/team-chat | 1 | 1 | 27 | 67 | 9 | 15 |
| components/theme | 0 | 0 | 5 | 2 | 0 | 0 |
| components/transcriptions | 1 | 1 | 2 | 4 | 0 | 1 |
| components/transitions | 0 | 0 | 6 | 2 | 0 | 0 |
| components/ui | 0 | 0 | 82 | 25 | 2 | 5 |
| components/voice | 0 | 0 | 10 | 3 | 5 | 0 |
| components/wallet | 1 | 1 | 1 | 4 | 0 | 3 |
| components/whatsapp-flows | 1 | 1 | 2 | 3 | 0 | 1 |
| hooks/analytics | 0 | 0 | 16 | 46 | 2 | 15 |
| hooks/assistant | 0 | 0 | 5 | 19 | 3 | 7 |
| hooks/auth | 0 | 0 | 7 | 18 | 3 | 5 |
| hooks/business | 0 | 0 | 15 | 32 | 2 | 15 |
| hooks/calls | 0 | 0 | 8 | 31 | 4 | 8 |
| hooks/chat | 0 | 0 | 53 | 88 | 6 | 39 |
| hooks/communication | 0 | 0 | 17 | 27 | 7 | 6 |
| hooks/copilot | 0 | 0 | 63 | 75 | 2 | 8 |
| hooks/crm | 0 | 0 | 28 | 48 | 4 | 17 |
| hooks/dashboard | 0 | 0 | 10 | 25 | 3 | 7 |
| hooks/evolution | 0 | 0 | 5 | 4 | 0 | 0 |
| hooks/gamification | 0 | 0 | 6 | 13 | 2 | 6 |
| hooks/gmail | 0 | 0 | 5 | 2 | 0 | 2 |
| hooks/inbox | 0 | 0 | 21 | 70 | 7 | 26 |
| hooks/integrations | 0 | 0 | 66 | 114 | 14 | 32 |
| hooks/performance | 0 | 0 | 5 | 9 | 0 | 0 |
| hooks/realtime | 0 | 0 | 12 | 17 | 2 | 5 |
| hooks/security | 0 | 0 | 5 | 8 | 1 | 7 |
| hooks/sla | 0 | 0 | 14 | 24 | 2 | 14 |
| hooks/system | 0 | 0 | 44 | 543 | 51 | 131 |
| hooks/tasks | 0 | 0 | 13 | 22 | 2 | 7 |
| hooks/team-chat | 0 | 0 | 22 | 48 | 2 | 12 |
| hooks/ui | 0 | 0 | 34 | 50 | 4 | 7 |
| hooks/voice | 0 | 0 | 9 | 1 | 2 | 0 |
| lib | 0 | 0 | 117 | 19 | 6 | 17 |
| lib/calls | 0 | 0 | 22 | 2 | 1 | 0 |
| lib/journey | 0 | 0 | 6 | 0 | 0 | 0 |
| pages | 1 | 16 | 18 | 529 | 51 | 127 |
| pages/admin | 0 | 5 | 7 | 24 | 2 | 14 |
| pages/admin-telemetria | 0 | 0 | 6 | 1 | 0 | 1 |
| services | 0 | 0 | 17 | 11 | 4 | 17 |
| types | 0 | 0 | 12 | 0 | 0 | 0 |
| utils | 0 | 0 | 8 | 0 | 0 | 0 |

## Rotas (url → arquivo)
- `/` [tela] → src/pages/Index.tsx (protegida)
- `/*` [tela] → src/pages/NotFound.tsx
- `/2fa` [tela] → src/pages/TwoFactorAuth.tsx
- `/access-denied` [tela] → src/pages/AccessDenied.tsx
- `/admin/auditoria-contatos` [tela] → src/pages/admin/ContactAuditPage.tsx (protegida)
- `/admin/cache-previas` [tela] → src/pages/admin/LinkPreviewCachePage.tsx (protegida)
- `/admin/protecao-contatos` [tela] → src/pages/admin/ContactProtectionPage.tsx (protegida)
- `/admin/rate-limit` [tela] → src/pages/admin/RateLimitDashboard.tsx (protegida)
- `/admin/roles` [tela] → src/pages/admin/RolesPage.tsx (protegida)
- `/auth` [tela] → src/pages/Auth.tsx
- `/auth/callback` [tela] → src/pages/SSOCallback.tsx
- `/chat-popup/:contactId` [tela] → src/pages/ChatPopup.tsx (protegida)
- `/forgot-password` [tela] → src/pages/ForgotPassword.tsx
- `/install` [tela] → src/pages/Install.tsx
- `/multiplix` [redirect] → **ARQUIVO NÃO RESOLVIDO**
- `/queue/:id` [tela] → src/pages/QueueDetails.tsx (protegida)
- `/queues/comparison` [tela] → src/pages/QueuesComparison.tsx (protegida)
- `/reset-password` [tela] → src/pages/ResetPassword.tsx
- `/sla` [tela] → src/pages/SLADashboard.tsx (protegida)
- `/sla/history` [tela] → src/pages/SLAHistory.tsx (protegida)
- `/verify-email` [tela] → src/pages/VerifyEmail.tsx

## Rotas HTTP de backend
- `GET /{t}` → scripts/ai-context/cenarios.mjs
- `GET /a` → scripts/ai-context/cenarios.mjs
- `GET /a` → scripts/ai-context/cenarios.mjs
- `POST /b` → scripts/ai-context/cenarios.mjs
- `POST /b` → scripts/ai-context/cenarios.mjs
- `DELETE /c` → scripts/ai-context/cenarios.mjs
- `PUT /d` → scripts/ai-context/cenarios.mjs
- `GET /u` → scripts/ai-context/cenarios.mjs
- `GET /users` → scripts/ai-context/cenarios.mjs
- `POST /users/:id` → scripts/ai-context/cenarios.mjs
- `GET /x` → scripts/ai-context/cenarios.mjs

## Vistas por id (menu/ViewRouter → arquivo)
- `achievements` → src/components/gamification/AchievementsSystem.tsx
- `admin` → src/components/admin/AdminView.tsx
- `agents` → src/components/agents/AgentsView.tsx
- `ai-usage` → src/components/admin/AIUsageDashboard.tsx
- `audit-logs` → src/components/security/AuditLogDashboard.tsx
- `automations` → src/components/automations/AutomationsManager.tsx
- `catalog` → src/components/catalog/ExternalProductManagement.tsx
- `chatbot` → src/components/chatbot/ChatbotFlowsView.tsx
- `churn` → src/components/ai/ChurnPredictionDashboard.tsx
- `connections` → src/components/connections/ConnectionsView.tsx
- `contacts` → src/components/contacts/ContactsView.tsx
- `crm360` → src/components/crm360/CRM360ExplorerView.tsx
- `dashboard` → src/components/dashboard/DashboardView.tsx
- `diagnostics` → src/components/diagnostics/DiagnosticsView.tsx
- `docs` → src/components/docs/SystemFeaturesView.tsx
- `email-chat` → src/components/email/EmailChatInbox.tsx
- `evolution-monitor` → src/components/monitoring/EvolutionMonitoringDashboard.tsx
- `gmail` → src/components/gmail/GmailInboxView.tsx
- `gmail-webhook` → src/components/admin/GmailWebhookMonitor.tsx
- `google-calendar` → src/components/integrations/GoogleCalendarIntegration.tsx
- `groups` → src/components/groups/GroupsView.tsx
- `inbox` → src/components/inbox/RealtimeInboxView.tsx
- `integrations` → src/components/integrations/IntegrationsHub.tsx
- `knowledge` → src/components/knowledge/KnowledgeBaseView.tsx
- `media-migration` → src/components/admin/MediaMigrationTool.tsx
- `meta-capi` → src/components/meta-capi/MetaCAPIView.tsx
- `multiplix` → src/components/multiplix/MultiplixView.tsx
- `nps` → src/components/nps/NPSDashboard.tsx
- `omni-inbox` → src/components/omnichannel/OmnichannelInbox.tsx
- `omnichannel` → src/components/omnichannel/OmnichannelManager.tsx
- `performance` → src/components/performance/PerformanceMonitor.tsx
- `privacy` → src/components/compliance/LGPDComplianceView.tsx
- `public-api` → src/components/admin/PublicApiDashboard.tsx
- `queues` → src/components/queues/QueuesView.tsx
- `reports` → src/components/reports/AdvancedReportsView.tsx
- `schedule` → src/components/schedule/ScheduleCalendarView.tsx
- `search-insights` → src/components/admin/SearchInsightsView.tsx
- `security` → src/components/security/SecurityView.tsx
- `sentiment` → src/components/dashboard/SentimentAlertsDashboard.tsx
- `settings` → src/components/settings/SettingsView.tsx
- `sla` → src/components/queues/SLADashboard.tsx
- `supervisao` → src/components/admin/SupervisaoView.tsx
- `talkx` → src/components/talkx/TalkXView.tsx
- `talkx-kit` → src/components/talkx/__dev__/TalkXKit.tsx
- `tasks` → src/components/tasks/TasksModule.tsx
- `team-chat` → src/components/team-chat/TeamChatView.tsx
- `telemetry` → src/pages/AdminTelemetriaPage.tsx
- `themes` → src/components/settings/ThemeCustomizer.tsx
- `ticket-classifier` → src/components/ai/AutoTicketClassifier.tsx
- `transcriptions` → src/components/transcriptions/TranscriptionsHistoryView.tsx
- `voip` → src/components/calls/TelefoniaView.tsx
- `wa-flows` → src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx
- `wa-templates` → src/components/catalog/WhatsAppTemplatesManager.tsx
- `wallet` → src/components/wallet/ClientWalletView.tsx
- `warroom` → src/components/dashboard/WarRoomDashboard.tsx

## Edge functions
- `ai-auto-tag` — tabelas: contacts, messages, notifications, profiles, queue_members, queues, user_roles; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `ai-churn-analysis` — tabelas: contacts, messages, profiles; chamada por 1 arquivo(s) do front
- `ai-classify-tickets` — tabelas: ai_conversation_tags, profiles; chamada por 1 arquivo(s) do front
- `ai-conversation-analysis` — tabelas: -; chamada por 1 arquivo(s) do front
- `ai-conversation-summary` — tabelas: -; chamada por 1 arquivo(s) do front
- `ai-deadline-calculator` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `ai-enhance-message` — tabelas: -; chamada por 2 arquivo(s) do front
- `ai-jobs-worker` — tabelas: ai_jobs; chamada por 0 arquivo(s) do front, por SQL/cron
- `ai-kb-ingest` — tabelas: knowledge_base_articles, knowledge_base_files; chamada por 1 arquivo(s) do front
- `ai-lead-temperature` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `ai-loss-risk` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `ai-multimodal-analysis` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `ai-objection-handler` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `ai-price-anchor` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `ai-product-recommendation` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `ai-proxy` — tabelas: ai_providers; chamada por 4 arquivo(s) do front
- `ai-suggest-reply` — tabelas: contact_custom_fields, contact_notes, contacts; chamada por 1 arquivo(s) do front
- `ai-transcribe-audio` — tabelas: messages; chamada por 1 arquivo(s) do front
- `ai-usage-outbox-drain` (verify_jwt=false) — tabelas: -; chamada por 0 arquivo(s) do front, por SQL/cron
- `approve-password-reset` — tabelas: audit_logs, password_reset_requests, profiles; chamada por 2 arquivo(s) do front
- `assistant-gateway` — tabelas: assistant_profiles, contacts, conversation_tasks, messages, sales_deals; chamada por 1 arquivo(s) do front
- `auth-login` (verify_jwt=false) — tabelas: profiles; chamada por 1 arquivo(s) do front
- `auto-close-conversations` — tabelas: auto_close_config, contacts, conversation_closures, messages; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `automation-suggest-reply` — tabelas: messages; chamada por 1 arquivo(s) do front
- `batch-fetch-avatars` (verify_jwt=false) — tabelas: avatars, contacts, whatsapp_connections; chamada por 2 arquivo(s) do front, por SQL/cron
- `bitrix-api` — tabelas: contacts; chamada por 2 arquivo(s) do front
- `chatbot-l1` — tabelas: chatbot_flows, contacts, knowledge_base_articles, messages; chamada por 1 arquivo(s) do front
- `classify-audio-meme` — tabelas: -; chamada por 2 arquivo(s) do front
- `classify-emoji` — tabelas: -; chamada por 1 arquivo(s) do front
- `classify-sticker` — tabelas: -; chamada por 2 arquivo(s) do front
- `cleanup-rate-limit-logs` — tabelas: blocked_ips, rate_limit_logs, security_alerts; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `connection-health-check` (verify_jwt=false) — tabelas: audit_logs, connection_alert_preferences, connection_health_logs, global_settings, messages, notifications, profiles, reconnection_logs, talkx_campaigns, user_roles, warroom_alerts, whatsapp_connections; chamada por 3 arquivo(s) do front, por SQL/cron
- `copilot-live` — tabelas: assistant_profiles, contacts, conversation_tasks, copilot_insights, copilot_sessions, profiles; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `create-user` — tabelas: audit_logs, gmail_accounts, profiles, user_roles, user_service_accounts; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `crm-integration` (verify_jwt=false) — tabelas: carriers, companies, company_addresses, company_social_media, contact_phones, contacts, conversation_closures, crm_contact_links, crm_sync_outbox, customers, email_messages, email_threads, feature_flags, gmail_accounts, profiles, suppliers; chamada por 1 arquivo(s) do front
- `csp-report` (verify_jwt=false) — tabelas: -; chamada por 0 arquivo(s) do front
- `detect-new-device` — tabelas: security_alerts, user_devices, user_sessions; chamada por 1 arquivo(s) do front
- `elevenlabs-agent-token` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `elevenlabs-dialogue` — tabelas: -; chamada por 1 arquivo(s) do front
- `elevenlabs-scribe-token` — tabelas: -; chamada por 2 arquivo(s) do front
- `elevenlabs-sfx` — tabelas: -; chamada por 1 arquivo(s) do front
- `elevenlabs-sts` — tabelas: -; chamada por 1 arquivo(s) do front
- `elevenlabs-tts` — tabelas: -; chamada por 2 arquivo(s) do front
- `elevenlabs-tts-stream` — tabelas: -; chamada por 1 arquivo(s) do front
- `elevenlabs-voice-design` — tabelas: audit_logs; chamada por 1 arquivo(s) do front
- `elevenlabs-webhook` (verify_jwt=false) — tabelas: audit_logs; chamada por 0 arquivo(s) do front
- `evolution-api` — tabelas: audit_logs, contacts, global_settings, messages, profiles, whatsapp_connections; chamada por 2 arquivo(s) do front
- `evolution-sync` — tabelas: -; chamada por 1 arquivo(s) do front
- `evolution-webhook` (verify_jwt=false) — tabelas: whatsapp_connections; chamada por 1 arquivo(s) do front
- `external-db-bridge` — tabelas: query_telemetry; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `external-db-proxy` — tabelas: -; chamada por 1 arquivo(s) do front
- `fetch-link-preview` — tabelas: link_preview_cache; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `get-call-recording` — tabelas: calls; chamada por 1 arquivo(s) do front
- `get-mapbox-token` — tabelas: -; chamada por 1 arquivo(s) do front
- `get-sip-password` — tabelas: profiles; chamada por 1 arquivo(s) do front
- `gmail-cron-sync` (verify_jwt=false) — tabelas: gmail_accounts; chamada por 0 arquivo(s) do front, por SQL/cron
- `gmail-oauth` — tabelas: audit_logs, gmail_accounts, gmail_oauth_states; chamada por 1 arquivo(s) do front
- `gmail-send` — tabelas: email_messages, email_threads, gmail_accounts; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `gmail-sync` — tabelas: email_attachments, email_labels, email_messages, email_threads, gmail_accounts; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `gmail-webhook` (verify_jwt=false) — tabelas: contacts, email_attachments, email_messages, email_threads, gmail_accounts; chamada por 1 arquivo(s) do front
- `health` — tabelas: whatsapp_connections; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `invite-user` — tabelas: audit_logs, user_roles; chamada por 1 arquivo(s) do front
- `message-delivery` — tabelas: contacts, messages, profiles, whatsapp_connections; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `metrics` — tabelas: query_telemetry, rate_limit_logs, webhook_rate_limits; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `migrate-media-storage` — tabelas: audit_logs, messages, whatsapp_connections; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `multiplix-audience` — tabelas: profiles; chamada por 1 arquivo(s) do front
- `multiplix-dispatch` — tabelas: multiplix_audience_members, multiplix_audiences, multiplix_blocks, multiplix_dispatches, multiplix_recipients, profiles; chamada por 1 arquivo(s) do front
- `multiplix-send` — tabelas: multiplix_delivery_items, multiplix_dispatches, multiplix_events, multiplix_voice_assets, profiles, whatsapp_connections; chamada por 1 arquivo(s) do front, por SQL/cron
- `multiplix-voices` — tabelas: multiplix_voice_assets, multiplix_voice_grants, profiles, user_roles; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `promogifts-catalog` — tabelas: categories, product_variants, products, suppliers; chamada por 2 arquivo(s) do front
- `public-api` (verify_jwt=false) — tabelas: -; chamada por 0 arquivo(s) do front
- `recover-corrupted-audios` — tabelas: messages, whatsapp_connections; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `recover-message-media` — tabelas: messages, whatsapp_connections; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `revoke-auth-sessions` — tabelas: audit_logs; chamada por 3 arquivo(s) do front
- `searchbox-budget-alert` (verify_jwt=false) — tabelas: searchbox_usage_daily; chamada por 0 arquivo(s) do front, por SQL/cron
- `send-email` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `send-rate-limit-alert` — tabelas: blocked_ips, notifications, security_alerts, user_roles; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `send-scheduled-report` (verify_jwt=false) — tabelas: agent_stats, contacts, conversation_analyses, conversation_sla, messages; chamada por 2 arquivo(s) do front, por SQL/cron
- `sentiment-alert` — tabelas: contacts, conversation_analyses, profiles, user_settings; chamada por 1 arquivo(s) do front
- `status` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `sync-call-records` (verify_jwt=false) — tabelas: calls; chamada por 0 arquivo(s) do front
- `talkx-ai` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `talkx-link` (verify_jwt=false) — tabelas: talkx_links, talkx_recipients; chamada por 1 arquivo(s) do front
- `talkx-report` — tabelas: profiles, talkx_campaigns, talkx_recipients; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `talkx-scheduler` — tabelas: talkx_campaigns, talkx_settings, whatsapp_connections; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `talkx-send` — tabelas: contact_custom_fields, profiles, talkx_campaign_events, talkx_campaigns, talkx_delivery_log, talkx_links, talkx_recipients, talkx_settings, talkx_template_variants, talkx_templates, talkx_test_send_claims, talkx_test_sends, whatsapp_connections; chamada por 2 arquivo(s) do front, por SQL/cron
- `talkx-storage-purge` — tabelas: -; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `voice-agent` — tabelas: -; chamada por 1 arquivo(s) do front
- `voice-changer` — tabelas: -; chamada por 1 arquivo(s) do front
- `voice-copilot-action` — tabelas: contact_notes, contacts, conversation_analyses, conversation_tasks, messages, profiles, queues, user_roles; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `webauthn` — tabelas: audit_logs, passkey_credentials, webauthn_challenges; chamada por 1 arquivo(s) do front
- `webhook-diagnostic` — tabelas: messages, whatsapp_connections; chamada por 1 arquivo(s) do front
- `webhook-replay` — tabelas: webhook_failures; chamada por 0 arquivo(s) do front — **ÓRFÃ**
- `whatsapp-webhook` (verify_jwt=false) — tabelas: channel_connections, messages; chamada por 0 arquivo(s) do front

## Cron jobs (pg_cron / vercel)
- `ai-jobs-tick-1min` * * * * * (20261002371230_ia045_ia046_ai_jobs_durabilidade_e_estados.sql)
- `ai-usage-outbox-drain` 3-53/10 * * * * → edge ai-usage-outbox-drain (20261103223000_ai_usage_outbox_drain_cron.sql)
- `avatars-refresh` 0 * * * * → edge batch-fetch-avatars (20260828200100_cron_avatars_refresh_hourly.sql)
- `cleanup-edge-rate-limits` */15 * * * * (20260905070000_ingest_lock_feature_flags_audit_rate_limit_cleanup.sql)
- `cleanup-link-preview-cache` 0 3 * * * (20260826210100_cron_cleanup_link_preview_cache.sql)
- `close-stale-calls` */5 * * * * (20261014014129_close_stale_calls.sql)
- `connection-health-check` */5 * * * * → edge connection-health-check (20260924100800_schedule_connection_health_check_cron.sql)
- `copilot-retention-daily` 0 2 * * * (20261115050000_copilot_retention_aggregates.sql)
- `crm-sync-outbox` 1-59/2 * * * * (20261016011302_crm_sync_outbox_cron.sql)
- `crm-sync-outbox-cleanup` 17 4 * * * (20261016011302_crm_sync_outbox_cron.sql)
- `cron-historico-retencao-7d` 17 3 * * * (20261102022200_cron_historico_retencao_7d.sql)
- `csat-reply-capture-tick` */2 * * * * (20261015210626_csat_pipeline.sql)
- `dispatch-scheduled-messages` * * * * * (20261011133612_dispatch_scheduled_messages.sql)
- `expire-orphan-user-sessions` 23 3 * * * (20261013230007_my_active_sessions.sql)
- `expire-stale-agent-presence` */2 * * * * (20260925100542_agent_presence_server_ttl.sql)
- `gmail-incremental-sync` */5 * * * * → edge gmail-cron-sync (20260829110000_gmail_incremental_sync_cron.sql)
- `login-attempts-retention-90d` 41 4 * * * (20261102012400_login_attempts_retencao_90d.sql)
- `multiplix-send-trigger` */2 * * * * (20260927320000_multiplix_cron_scheduler.sql)
- `outbound-sending-sweeper` * * * * * (20261113171400_varredura_mensagens_presas_em_enviando.sql)
- `purge-qr-attempts` 25 3 * * * (20261015215658_qr_attempts_history.sql)
- `reconnection-logs-retention-30d` 30 4 * * * (20261012134000_auto_reconnect_logs.sql)
- `search-events-retention` 10 4 * * * (20261016013134_search_events.sql)
- `searchbox-budget-alert` 0 12 * * * → edge searchbox-budget-alert (20261006235031_searchbox_budget_alert_email_ledger.sql)
- `security-acl-score` 23 * * * * (20261013230008_security_acl_alerts_monitor.sql)
- `send-scheduled-report-trigger` */2 * * * * (20261120080000_scheduled_report_cron.sql)
- `talkx-scheduler-1min` * * * * * (20260909000000_talkx_scheduler_cron.sql)
- `tasks-notify-due` * * * * * (20260928140100_tasks_notify_due_cron.sql)
- `user-sessions-expire-diario` 17 3 * * * (20261010063527_user_sessions_expire_diario.sql)
- `voice-changer-tmp-purge` 17 * * * * (20261015224516_audio_memes_storage_paths.sql)

## Integrações externas
- SDKs: ElevenLabs, Supabase, i18next, react-query, zod
- hosts mais citados: edge.invalid, stub.supabase.co, cdn.test, proj.supabase.co, zapp-web-v2.vercel.app, edge.test, example.invalid, tnnnlkbymytvtqngbbqh.supabase.co, example.supabase.co, exemplo.test, projeto.supabase.co, supabase-test.example, api.elevenlabs.io, exemplo.com, signed.test
- webhooks recebidos: ai-usage-outbox-drain, auth-login, batch-fetch-avatars, connection-health-check, crm-integration, csp-report, elevenlabs-webhook, evolution-webhook, gmail-cron-sync, gmail-webhook, public-api, searchbox-budget-alert, send-scheduled-report, sync-call-records, talkx-link, whatsapp-webhook
- env de integração (só nomes): ANTHROPIC_API_KEY, BITRIX_WEBHOOK_URL, CHATBOT_L1_WEBHOOK_SECRET, CRON_SECRET, ELEVENLABS_WEBHOOK_SECRET, EVOLUTION_API_FLAVOR, EVOLUTION_API_KEY, EVOLUTION_API_URL, EVOLUTION_INSTANCE_NAME, EVOLUTION_INSTANCE_TOKEN, EVOLUTION_VPS_SUPABASE_ANON_KEY, EVOLUTION_VPS_SUPABASE_URL, EVOLUTION_WEBHOOK_ENFORCE, EVOLUTION_WEBHOOK_SECRET, GMAIL_CAS_JWT, GMAIL_CAS_POSTGREST_URL, GMAIL_OIDC_AUDIENCE, GMAIL_OIDC_EMAIL, GMAIL_OIDC_JWKS_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, GROQ_API_KEY, INTERNAL_ALERT_SECRET, MULTIPLIX_SCOPE_HMAC_SECRET, OPENAI_API_KEY, PREVIEW_EGRESS_SHARED_SECRET, RESEND_API_KEY, TALKX_CONVERT_SECRET, VITE_ENABLE_GMAIL_INTEGRATION, VITE_SENTRY_DSN, VITE_SENTRY_ENVIRONMENT, WEBHOOK_SECRET, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN

## Permissões / papéis
- papéis no código: alert (129), status (116), admin (71), agent (63), supervisor (39), user (38), dialog (30), img (21), region (21), button (20), group (19), authenticated (18), tab (16), service_role (15), tablist (15), listbox (14), radiogroup (14), menuitem (11), option (11), radio (11), anon (10), progressbar (10), combobox (9), system (9), note (8), alertdialog (7), toolbar (7), list (6), log (5), menu (5), tabpanel (5), article (4), complementary (4), assistant (3), cliente (3), grid (3), leader (3), main (3), navigation (3), presentation (3), row (3), separator (3), slider (3), tooltip (3), RH (2), follower (2), form (2), fornecedor (2), gridcell (2), listitem (2), string (2), switch (2), A (1), B (1), ausente (1), banner (1), body (1), checkbox (1), customer (1), driver (1), edge (1), fundo (1), gateway (1), grand (1), html (1), intermediary (1), link (1), member (1), parent (1), positive (1), postgres (1), primary (1), public (1), search (1), special_agent (1), sup (1), target (1), textbox (1), texto (1), timer (1), unknown (1), untrusted (1)
- enums de papel: app_role: admin|supervisor|agent
- guards: src/components/auth/ProtectedRoute.tsx, src/components/copilot/DiscountGuardrailBanner.tsx · rotas protegidas: 11 · públicas: /*, /2fa, /access-denied, /auth, /auth/callback, /forgot-password, /install, /reset-password, /verify-email
- feature flags: ENABLE_ANALYTICS, ENABLE_DEBUG, ENABLE_GAMIFICATION, ENABLE_GMAIL_INTEGRATION, ENABLE_IMAGE_TRANSFORMATION, FEATURE_AUDIT, FEATURE_CTA, FEATURE_FLAGS_QUERY_KEY, FEATURE_GATES, FEATURE_REGISTRY, FEATURE_TILE, FEATURE_X, crm.integration, inbox.talk-me, nova-tela, video_call

## Alertas (baseline.json → alertas)
- rotas_sem_arquivo: 0
- componentes_ambiguos: 0
- menu_sem_destino: 8 — ex.: Enviados -> SENT, Favoritos -> STARRED, Importantes -> IMPORTANT
- edges_orfas: 33 — ex.: ai-auto-tag, ai-deadline-calculator, ai-lead-temperature
- edges_chamadas_sem_pasta: 0
- tabelas_sem_rls: 0
- tabelas_usadas_sem_definicao: 10 — ex.: avatars, carriers, categories
- tabelas_com_drift_migration_vs_types: 6 — ex.: app_settings, edge_rate_limits, feature_flags
- rpcs_sem_definicao: 13 — ex.: admin_set_role, complete_crm_sync_outbox, get_companies_by_phones_batch
- componentes_orfaos: 45 — ex.: analise-prs/resgate-261118-lote2/src/components/copilot/RadarPhase6Panel.tsx, src/components/calls/DialPad.tsx, src/components/cognitive/ProgressiveDisclosure.tsx
- componentes_com_nome_duplicado: 42 — ex.: AchievementBadge, BreadcrumbItem, CommandGroup
- scripts_orfaos: 1 — ex.: scripts/db-audit/n118-window-open-proof.test.sql
- env_usadas_nao_declaradas: 9 — ex.: DEV, MODE, NODE_ENV
- ciclos_de_import: 11
- possiveis_segredos_no_codigo: 4 — ex.: scripts/ai-context/cenarios.mjs:102, scripts/ci/edge-coverage-authz.unit.mjs:398, scripts/ci/inventario-banco.unit.mjs:147

## Grafo de código (graphify)
- 96737 nós · 162214 arestas · 8941 comunidades · grafo do commit `f5a9f52f`
- comunidades maiores: Communities (8869 total, 3472 thin omitted) (5378), TalkXSuppression.tsx (1339), vitest (960), @tanstack/react-query (889), lucide-react (884), react (756), DashboardView.tsx (669), chat.ts (631), cn (578), ref_node_fs (531), schemas.ts (487), react-router-dom (449)
- símbolos mais chamados: cn() (src/lib/utils.ts), useAuth() (src/hooks/auth/useAuth.tsx), jsonResponse() (supabase/functions/_shared/validation.ts), errorResponse() (supabase/functions/_shared/validation.ts), handleCors() (supabase/functions/_shared/validation.ts), fail() (scripts/e2e-isolated/network-proof-policy.mjs), Logger (supabase/functions/_shared/validation.ts), requireEnv() (supabase/functions/_shared/validation.ts), fmtInt() (src/components/talkx/kit/format.ts), useUserRole() (src/hooks/system/useUserRole.ts), .from() (supabase/functions/_shared/evolution-types.ts), validationErrorResponse() (supabase/functions/_shared/schemas.ts)
- consulta local: `graphify query "<pergunta>"`, `graphify path "<A>" "<B>"`, `graphify explain "<X>"`

## Hotspots (arquivos mais alterados, 90 dias)
- supabase/deployment-manifest.json (38)
- ESTADO.md (27)
- docs/DB-INVENTORY.md (22)
- docs/talkx/ESTADOS.md (21)
- supabase/schema-manifest.json (17)
- .github/workflows/db-guard.yml (15)
- src/integrations/supabase/types.ts (15)
- supabase/schema-catalog.json (15)
- scripts/db-audit/grants-baseline.json (11)
- .github/workflows/ci.yml (10)
- docs/agentes/github-ci.md (10)
- docs/ci/README.md (9)
- supabase/functions/evolution-api/index.ts (9)
- PENDENCIAS.md (8)
- scripts/ci/ci-docs-baseline.unit.mjs (8)

## Workflows
- `auto-update-pr-branch.yml` — Auto Update PR Branches (push, schedule, workflow_dispatch, workflow_run; cron 7,37 * * * *)
- `automation-local.yml` — Automação local (pull_request, push, workflow_dispatch)
- `branch-hygiene-audit.yml` — Branch Hygiene Audit (schedule, workflow_dispatch; cron 56 7 * * 1)
- `check-talkx-pr-body.yml` — Talk X PR body check (pull_request)
- `ci.yml` — CI/CD Pipeline (pull_request, push, workflow_dispatch)
- `codeql.yml` — CodeQL (schedule, workflow_dispatch; cron 30 9 * * *)
- `contexto.yml` — Contexto para agentes de IA (10 min) (push, schedule, workflow_dispatch; cron 3 * * * *)
- `crm-sync-worker.yml` — CRM Sync Worker (workflow_dispatch; cron */5 * * * *)
- `db-guard.yml` — DB Guard (offline) (merge_group, pull_request, push, workflow_dispatch)
- `db-live-guard.yml` — DB Live Guard (schedule, workflow_dispatch; cron 13 6 * * 1)
- `db-migrate.yml` — DB Migrate (production) (workflow_dispatch)
- `dependency-review.yml` — Dependency Review (pull_request)
- `deploy-functions.yml` — Deploy Edge Functions (push, workflow_dispatch)
- `e2e-baselines.yml` — e2e-baselines (workflow_dispatch)
- `e2e-logado-isolado.yml` — E2E isolado - login e suíte completa (pull_request, workflow_dispatch)
- `e2e-logado.yml` — E2E logado (workflow_dispatch, workflow_run)
- `e2e-talkx.yml` — E2E Talk X (visual/launch + Auth smoke) (pull_request, workflow_dispatch)
- `front-release-targets.yml` — Front release targets (V2/V3) (push, schedule, workflow_dispatch; cron 17 * * * *)
- `inventario-estado-semanal.yml` — Inventário do estado real (semanal) (schedule, workflow_dispatch; cron 23 10 * * 1)
- `notifica-falha-main.yml` — Notifica falha na main (workflow_run)
- `scorecard.yml` — OpenSSF Scorecard (push, schedule, workflow_dispatch; cron 17 7 * * 1)
- `settings-guard.yml` — Settings Guard (schedule, workflow_dispatch; cron 15 7 * * *)
- `talkx-status-regen.yml` — Talk X V4 placar regen (push + semanal) (push, schedule, workflow_dispatch; cron 45 7 * * 1)
- `targeted-ledger-evidence.yml` — Targeted Ledger Evidence (workflow_dispatch)
- `types-sync.yml` — types-sync (push, schedule, workflow_dispatch; cron 49 5 * * 1)
- `vercel-env-cleanup.yml` — V043-V065 Vercel Env Cleanup (workflow_dispatch)

## Scripts npm
- `maintenance:doctor`: `node scripts/maintenance/run.mjs doctor --root .`
- `maintenance:check`: `node scripts/maintenance/run.mjs check --root . --ref origin/main`
- `maintenance:heal`: `node scripts/maintenance/run.mjs heal --root . --ref origin/main`
- `test:maintenance`: `node --test scripts/maintenance/maintenance.unit.mjs`
- `dev`: `vite`
- `build`: `vite build`
- `build:dev`: `vite build --mode development`
- `lint`: `node scripts/ci/lint-ratchet.mjs`
- `lint:fix`: `node scripts/ci/lint-ratchet.mjs --fix`
- `test`: `vitest run`
- `test:watch`: `vitest`
- `test:coverage`: `vitest run --coverage`
- `test:e2e`: `playwright test`
- `test:e2e:report`: `playwright show-report`
- `typecheck`: `tsc -b --force`
- `db:guard`: `node scripts/db-audit/supabase-usage-guard.mjs && node scripts/db-audit/check-migration-drift.mjs`
- `implicit-any-check`: `node scripts/ci/implicit-any-ratchet.mjs`
- `preview`: `vite preview`
- `test:contracts`: `vitest run --config vitest.contracts.config.ts`
- `mutation:mapa`: `node scripts/mutation/run-mapa.mjs`
- `graph:setup`: `bash scripts/graphify/setup.sh`
- `graph:update`: `graphify update .`
- `contexto:ia`: `node scripts/ai-context/gerar.mjs --out docs/contexto/codigo`
- `contexto:ia:test`: `node --test scripts/ai-context/gerar.unit.mjs`
- `prepare`: `husky || true`
- `ci:local`: `node scripts/ci/ci-local.mjs`
- `ci:local:rapido`: `node scripts/ci/ci-local.mjs --rapido`
- `automation:doctor`: `node scripts/automation.mjs doctor`
- `automation:test`: `node scripts/automation.mjs test`
- `automation:check`: `node scripts/automation.mjs check --ref HEAD`
- `automation:heal`: `node scripts/automation.mjs heal --ref origin/main`
- `automation:nightly`: `node scripts/automation.mjs nightly --ref origin/main`
- `automation:graph`: `node scripts/automation.mjs graph`
- `automation:status`: `node scripts/automation.mjs graph status`
- `automation:install-hooks`: `node scripts/automation.mjs install-hooks`
- `automation:uninstall-hooks`: `node scripts/automation.mjs uninstall-hooks`

## Documentos (raiz e docs/)
- `.github/PULL_REQUEST_TEMPLATE.md` (65 linhas)
- `AGENTS.md` — AGENTS.md — Zapp Web V2 (108 linhas)
- `AUDIT-A-PROCESSAR-261031.md` — Auditoria ? _a-processar/ZAPP_WEB_V2_LOCAL/Zapp_Web_V2 (119 linhas)
- `CHANGELOG.md` — Changelog (90 linhas)
- `CLAUDE.md` (2 linhas)
- `CONTRIBUTING.md` — Guia de Contribuição — Zapp Web V2 (119 linhas)
- `ESTADO.md` — ESTADO.md — o que está ligado e quem chama (156 linhas)
- `FEATURE_REGISTRY.md` — FEATURE_REGISTRY.md — registro das views do V2 (108 linhas)
- `HANDOFF_NEXT_SESSION.md` — HANDOFF — Próxima sessão (Claude Code) (177 linhas)
- `PENDENCIAS.md` — PENDÊNCIAS CI — 2026-11-12 (461 linhas)
- `README.md` — 🚀 ZAPP-WEB (Pronto Talk Suite) (369 linhas)
- `RELATORIO_CI.md` — RELATÓRIO CI — fix-ci-workflows-hxupgs / fix-ci-workflows-261112-0400 (465 linhas)
- `RESGATE-ANALISE-261031.md` — RESGATE-ANALISE-261031.md (456 linhas)
- `SECURITY.md` — 🔒 Política de Segurança — ZAPP-WEB (95 linhas)
- `TESTING_CONVENTION.md` — TESTING_CONVENTION.md — onde cada teste mora e como ele roda (104 linhas)
- `TRIAGEM-PRS-GITHUB-261031.md` — TRIAGEM DE PRs - adm01-debug/Zapp_Web_V2 (210 linhas)
- `docs/AUTOMACAO_LOCAL.md` — Automação local — Zapp_Web_V2 (713 linhas)
- `docs/BACKUP-RECOVERY-STRATEGY.md` — 🔐 ZAPP-WEB — Estratégia de Backup e Recovery (336 linhas)
- `docs/CAPACIDADES.md` — Capacidades de chamada por canal (59 linhas)
- `docs/COMPLETE_SYSTEM_FEATURES.md` — 📋 Levantamento Completo de Funcionalidades do Sistema (1061 linhas)
- `docs/CONEXOES_WHATSAPP_RUNBOOK.md` — Runbook — Conexões de WhatsApp (V2) (235 linhas)
- `docs/CRM360_TECHNICAL_DOCS.md` — ZAPP-WEB × CRM 360° — Documentação Técnica (109 linhas)
- `docs/DB-INVENTORY.md` — Inventário de objetos do banco — `public` (299 linhas)
- `docs/DB-SECURITY.md` — Seguranca do banco — notas operacionais (279 linhas)
- `docs/DEPLOYMENT.md` — 🚀 Guia de Deploy - ZAPP-WEB (349 linhas)
- `docs/DISTRIBUTION-FALLBACKS.md` — Distribuição de Atendimentos — Tabela-Verdade de Fallbacks (314 linhas)
- `docs/EVOLUTION_API_GAPS_ANALYSIS.md` — 🔬 ZAPP-WEB × EVOLUTION API — ANÁLISE DE GAPS (158 linhas)
- `docs/EVOLUTION_API_REFERENCE.md` — ⚡ EVOLUTION API v2 — Análise Técnica Completa (1285 linhas)
- `docs/EVOLUTION_WEBHOOKS_DOCUMENTATION.md` — 📡 EVOLUTION API - DOCUMENTAÇÃO COMPLETA DE WEBHOOKS (2471 linhas)
- `docs/HANDOFF_EVOLUTION_SECURITY_2026-04-12.md` — 🔄 HANDOFF — ZAPP-WEB × Evolution API Security Improvements (293 linhas)
- `docs/INCIDENT-RUNBOOK.md` — 🚨 ZAPP-WEB — Runbook de Incidentes (349 linhas)
- `docs/JORNADA_MENSAGEM_WHATSAPP.md` — Jornada da mensagem de WhatsApp — Zapp Web V2 (92 linhas)
- `docs/LGPD-RETENTION-POLICY.md` — 🛡️ ZAPP-WEB — Política de Retenção de Dados (LGPD) (398 linhas)
- `docs/MIGRATIONS.md` — Migrations — procedimento e armadilhas (613 linhas)
- `docs/POP-ATENDIMENTO-BASICO.md` — 📝 POP — Procedimento Operacional Padrão (256 linhas)
- `docs/PROJECT_TEMPLATE.md` — 🏗️ Template de Projeto Base - WhatsApp CRM (875 linhas)
- `docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md` — PROMPT PARA LOVABLE — Integração completa CRM 360° no zapp-web (222 linhas)
- `docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md` — PROMPT LOVABLE — Integração do Painel de Inteligência Comercial (96 linhas)
- `docs/PRONTO_PRODUCAO.md` — Pronto para produção — fluxos críticos do Zapp Web V2 (73 linhas)
- `docs/README.md` — 📚 ZAPP-WEB Documentation (98 linhas)
- `docs/REALTIME-CHANNELS-INVENTORY.md` — Inventário dos canais Realtime — Zapp Web V2 (144 linhas)
- `docs/SLA-ESCALATION-CRON.md` — SLA Escalation Cron — Documentação Técnica (273 linhas)
- `docs/TROUBLESHOOTING.md` — 🔧 Guia de Troubleshooting - ZAPP-WEB (415 linhas)
- `docs/WEBHOOK_EVENTS.md` — 📡 ZAPP-WEB — WEBHOOK EVENTS DOCUMENTATION (401 linhas)
- `docs/WEBHOOK_SECURITY.md` — Webhook Security - HMAC Signature Validation (207 linhas)
- `docs/audit_report.md` — 🛡️ Relatório de Auditoria Enterprise: Pronto Talk Suite (ZAPP-WEB) (108 linhas)
- `docs/auditoria-liquidação-branches.md` — Auditoria de Liquidação de Branches — Zapp_Web_V2 (41 linhas)
- `docs/contracts.md` — Contratos das Edge Functions (51 linhas)
- `docs/crm-external-grants.md` — GRANTs Externos — CRM pgxfvjmuubtbowutlide (111 linhas)
- `docs/prod-readiness.md` — Prontidão de produção — Zapp Web V2 (main @ `ab657aa34`) (1858 linhas)
- subpastas de docs/: docs/pendencias (1093), docs/_arquivo (593), docs/contexto (263), docs/audits (183), docs/reconciliation (134), docs/design (64), docs/plans (59), docs/talkx (52), docs/ia (19), docs/adr (17), docs/catalogo (15), docs/runbooks (14), docs/multiplix (12), docs/mapa (10), docs/copiloto (9), docs/ci (8), docs/decisions (8), docs/handoffs (8), docs/agentes (6), docs/migration (6), docs/tipografia (6), docs/evidencias (5), docs/telefonia (3), docs/architecture (2), docs/security (2), docs/team-chat (2), docs/crm-integration (1), docs/dashboard (1), docs/design-system (1), docs/edge-functions-recovered (1), docs/hermes (1), docs/integracoes (1), docs/ops (1), docs/resgate (1)
- CHANGELOG topo: [Unreleased]

## Últimos commits
- 2026-11-26 `f5a9f52f` feat(talkx): painel dos jobs de dados nas configuracoes (#3415)
- 2026-11-26 `1fad01a7` feat(admin): historico das limpezas do cache de previas ganha tela (#3414)
- 2026-11-26 `87ddee79` feat(seguranca): politica de protecao de contatos ganha tela de gestao (#3413)
- 2026-11-26 `583c6450` feat(seguranca): trilha de exclusoes e bloqueios de contato ganha tela (#3412)
- 2026-11-26 `0a6acffd` feat(talkx): liga os alertas do motor (talkx_alerts) no acompanhamento (#3408)
- 2026-11-26 `3eb193aa` feat(talkx): campanha ganha o envio de teste antes de lancar (E47) (#3409)
- 2026-11-26 `ec33e1ea` feat: painel do segmento mostra as tags mais usadas no público (talkx_segment_tags) (#3407)
- 2026-11-26 `bcfebb7a` feat: liga o log de entrega da campanha (talkx_campaign_logs) no painel E74 (#3405)
- 2026-11-26 `515fbecb` feat: liga o retorno da campanha (conversões, receita e ROI) no Analytics (#3404)
- 2026-11-26 `73c76a78` chore(db): sincronizar artefatos derivados do banco (#3399)
- 2026-11-26 `6e6264b6` feat(edge): dead-letter reprocessável quando o ingest da mensagem recebida falha (E35) (#3397)
- 2026-11-26 `284367aa` feat: trilha de auditoria das conexoes e reconciliacao de INSTANCE_GONE (#3398)
- 2026-11-26 `501f3bb5` fix: trava exclusao de template do Talk X em campanha (N-127/N-127b) (#3394)
- 2026-11-26 `3d99ff1c` feat: acoes por mensagem (favoritar, fixar, responder depois, denunciar) (#3395)
- 2026-11-25 `9f9ec852` feat: bloqueio de login por cidade (paridade Promo Gifts V4) (#3393)

## Arquivos deste diretório
- `docs/contexto/codigo/rotas.json`
- `docs/contexto/codigo/modulos.json`
- `docs/contexto/codigo/componentes.json`
- `docs/contexto/codigo/hooks.json`
- `docs/contexto/codigo/edge-functions.json`
- `docs/contexto/codigo/banco.json`
- `docs/contexto/codigo/ferramentas.json`
- `docs/contexto/codigo/scripts.json`
- `docs/contexto/codigo/testes.json`
- `docs/contexto/codigo/logica.json`
- `docs/contexto/codigo/grafo.json`
- `docs/contexto/codigo/grafo-arestas.json`
- `docs/contexto/codigo/convencoes.json`
- `docs/contexto/codigo/grafo-graphify.json`
- `docs/contexto/codigo/baseline.json`
- `docs/contexto/codigo/manifest.json` (commit, data, hashes, erros — único arquivo com data/hora)
