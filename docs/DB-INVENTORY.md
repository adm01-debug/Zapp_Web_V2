# Inventário de objetos do banco — `public`

**Fonte de verdade:** `supabase/schema-catalog.json` — snapshot versionado de `postgres`.`public`
(campo `generated_at`: 2026-10-04), regenerado por
`scripts/db-audit/catalog.sql` e conferido contra o banco oficial pelo workflow `db-live-guard.yml`
(ver `scripts/db-audit/README.md`).
Este documento não substitui o catálogo: ele dá o que o catálogo não tem — **propósito, status de
acoplamento e consumidores conhecidos de cada tabela**.

**Origem:** etapa 11 da `docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-28.md` (pendência do plano de
27/08), que pede "tabela → propósito → status (ativo/parcial/roadmap) → consumidores conhecidos".

**Regra de manutenção:** PR que **cria ou altera objeto de banco** atualiza este arquivo na MESMA
PR. O que garante isso é a guarda `scripts/ci/db-inventory-doc.unit.mjs`, que lê este documento,
o catálogo e os arquivos do repositório: tabela do banco que não aparece aqui, consumidor
inexistente e status que o repositório não sustenta viram falha de CI.

## Como o status e os consumidores são medidos

Varredura textual do nome exato do objeto (com fronteira de palavra) em `src/`,
`supabase/functions/`, `scripts/`, `tests/`, `e2e/` e `.github/`. Ficam fora o arquivo gerado
`src/integrations/supabase/types.ts` e os **espelhos do schema**: arquivos que citam
30 ou mais objetos (baseline de grants/RLS, snapshot de publicação, varredura de
testes) citam tudo e por isso não dizem quem usa o quê.

| Status | Significado |
|---|---|
| `ativo` | algum arquivo de `src/` ou `supabase/functions/` cita o objeto (código de produto) |
| `parcial` | só `scripts/`, `tests/`, `e2e/` ou `.github/` citam: existe no banco, o produto ainda não usa |
| `roadmap` | nenhum arquivo do repositório cita: o objeto existe no banco sem consumidor conhecido |

Limites da medida, para quem for conferir: a varredura é **textual** — não distingue leitura de
escrita, não distingue código de comentário e não segue chamada indireta (a tabela `login_attempts`,
por exemplo, é usada pela RPC `clear_login_attempts`, não por `.from()`). **Consumidores
conhecidos** é uma amostra: até 3 arquivos que citam o objeto — **código de produto primeiro**,
depois o ferramental — em ordem alfabética dentro de cada grupo; `…` indica que há mais. A guarda
confere que todo caminho listado é consumidor de verdade; ela não obriga a listar todos.

## Objetos por tipo

| Objeto | Quantidade |
|---|---|
| Tabelas (`tables`) | 166 |
| Views (`views`) | 12 |
| Colunas (`columns`) | 1947 |
| Funções (`functions`) | 251 |
| Assinaturas de função (`function_signatures`) | 253 |
| Funções de gatilho (`trigger_functions`) | 64 |
| Restrições de verificação (`check_constraints`) | 157 |

As tabelas estão inventariadas uma a uma na seção seguinte. Views, funções, colunas e restrições
têm o inventário completo no catálogo (`supabase/schema-catalog.json`) e o manifesto com hash de
RLS em `supabase/schema-manifest.json`; este documento não os repete.

## Tabelas

Status apurado sobre o catálogo commitado (`generated_at` 2026-10-04) e os
arquivos do repositório, pela regra da seção anterior — cada linha carrega o seu.

| Tabela | Propósito | Status | Consumidores conhecidos |
|---|---|---|---|
| `agent_achievements` | Conquistas de gamificação do agente (tipo, nome e XP ganho) | ativo | `src/components/gamification/AchievementsSystem.tsx`, `src/components/gamification/__tests__/AchievementsSystem.test.tsx`, `src/hooks/__tests__/useAgentGamification.test.tsx` … |
| `agent_presence` | Presença do agente (status e carimbo de atualização) | ativo | `src/components/admin/CrisisRoom.tsx`, `src/components/admin/__tests__/CrisisRoom.metricas.test.tsx`, `src/components/agents/__tests__/AgentsView.capacidade.test.tsx` … |
| `agent_skills` | Habilidades cadastradas por agente, base do roteamento por skill | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/settings/SkillBasedRoutingSettings.tsx`, `src/components/settings/__tests__/SkillBasedRoutingSettings.test.tsx` |
| `agent_stats` | Agregado de gamificação do agente (XP, nível, enviadas, conquistas) | ativo | `src/components/dashboard/AgentPerformancePanel.tsx`, `src/components/gamification/AchievementsSystem.tsx`, `src/components/gamification/__tests__/AchievementsSystem.test.tsx` … |
| `agent_visibility_grants` | Concessões de visibilidade de um agente sobre outro | ativo | `src/components/admin/VisibilityGrantsManager.tsx`, `scripts/db-audit/crm-sync-outbox-behavior.test.sh`, `scripts/db-audit/dashboard-rls-authorization.test.sh` … |
| `ai_budget_reservations` | Reserva de tokens/orçamento por execução de função de IA | parcial | `scripts/qa/prova-orcamento-rate-limit.sh` |
| `ai_conversation_tags` | Tags sugeridas pela IA em conversa/contato, com confiança e origem | ativo | `src/components/ai/AutoTicketClassifier.tsx`, `src/components/settings/AIAutoTagsConfig.tsx`, `src/hooks/crm/__tests__/useContactEnrichedData.test.tsx` … |
| `ai_jobs` | Fila de jobs de IA (payload, idempotência, tentativas e estado) | ativo | `src/lib/aiJobs/status.ts`, `supabase/functions/_shared/__tests__/effect-reconcile.test.ts`, `supabase/functions/_shared/ai-jobs.ts` … |
| `ai_model_prices` | Preço por fornecedor/modelo e unidade de cobrança de IA | ativo | `supabase/functions/_shared/ai-usage.ts`, `scripts/db-audit/ai-usage-cost-window-open.test.sh`, `tests/contracts/ia055-custo-no-relatorio.test.ts` |
| `ai_providers` | Fornecedores de IA cadastrados (endpoint, modelo e referência do segredo) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/settings/ai-providers/__tests__/remocao-provedor-fallback.test.tsx`, `src/components/settings/ai-providers/useAIProviders.ts` … |
| `ai_usage_logs` | Log de uso de IA por chamada (tokens, modelo e função) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/inbox/AIConversationAssistant.tsx`, `src/components/settings/ai-providers/AIProviderHealthPanel.tsx` … |
| `allowed_countries` | Países liberados no bloqueio geográfico | ativo | `src/hooks/system/useGeoBlocking.ts`, `scripts/db-audit/network-policy-rpc.test.sh` |
| `audio_meme_favorites` | Áudios e memes favoritados por usuário | ativo | `src/hooks/communication/useAudioMemes.ts` |
| `audio_memes` | Biblioteca de áudios e memes disponíveis no chat | ativo | `src/components/settings/MediaLibraryAdmin.tsx`, `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx`, `src/components/settings/media-library/AIGenerateDialog.tsx` … |
| `audit_logs` | Trilha de auditoria de ações do sistema (usuário, ação, entidade) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/admin/useAdminData.ts`, `src/components/dashboard/useSentimentData.ts` … |
| `auto_close_config` | Configuração do fechamento automático por inatividade da conversa | ativo | `src/components/settings/AutomationSettings.tsx`, `src/hooks/inbox/useAutoCloseConversations.ts`, `supabase/functions/auto-close-conversations/index.test.ts` … |
| `automations` | Automações client-side (gatilho, configuração e estado) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/automations/AutomationsManager.tsx`, `src/components/automations/useAutomations.ts` … |
| `away_messages` | Mensagens de ausência por conexão de WhatsApp | ativo | `src/components/settings/MessagesSettings.tsx`, `src/components/settings/__tests__/MessagesSettings.test.tsx`, `src/hooks/business/useBusinessHours.ts` |
| `blocked_countries` | Países bloqueados no bloqueio geográfico, com motivo | ativo | `src/hooks/system/useGeoBlocking.ts`, `scripts/db-audit/network-policy-rpc.test.sh` |
| `blocked_ips` | IPs bloqueados, com motivo, autor e validade | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/security/BlockedIPDialogs.tsx`, `src/components/security/BlockedIPsPanel.tsx` … |
| `business_hours` | Horário de funcionamento por conexão (dia, abertura e fechamento) | ativo | `src/components/automations/automationConstants.ts`, `src/components/connections/BusinessHoursIndicator.tsx`, `src/components/settings/MessagesSettings.tsx` … |
| `calls` | Ligações registradas (contato, agente, conexão, direção e desfecho) | ativo | `src/App.tsx`, `src/__tests__/smoke.test.ts`, `src/components/admin/AIUsageDashboard.tsx` … |
| `campaign_ab_variants` | Variantes A/B de uma campanha, com contadores de envio | ativo | `src/components/campaigns/CampaignABTesting.tsx` |
| `campaign_contacts` | Destinatários da campanha e estado do envio de cada um | ativo | `src/hooks/communication/useCampaigns.ts` |
| `campaigns` | Campanhas de mensagem (conteúdo, mídia e configuração de disparo) | ativo | `src/components/campaigns/CampaignsView.tsx`, `src/components/campaigns/__tests__/CampaignCreateDialog.r2-mod-005.test.tsx`, `src/components/campaigns/__tests__/CampaignsView.audiencia.r2-mod-005.test.tsx` … |
| `catalog_favorites` | Produtos do catálogo externo favoritados pelo usuário | ativo | `src/components/catalog/ExternalProductCatalog.tsx`, `src/components/catalog/__tests__/ExternalProductCatalog.test.tsx`, `src/components/catalog/catalogShared.tsx` … |
| `catalog_rate_limit_hits` | Contadores de uso do catálogo por usuário e ação, em janela | roadmap | — |
| `catalog_rate_limits` | Limite de uso do catálogo por usuário e ação | ativo | `supabase/functions/promogifts-catalog/index.ts` |
| `catalog_send_events` | Histórico de envios de produto do catálogo por contato | ativo | `src/components/catalog/CatalogRail.tsx`, `src/components/catalog/ContactSelectionStep.tsx`, `src/components/catalog/ExternalProductCatalog.tsx` … |
| `channel_connections` | Conexões de canal (WhatsApp e omnichannel): identidade, estado e credenciais | ativo | `src/components/omnichannel/OmnichannelManager.tsx`, `src/lib/omnichannel/execucaoDeCanais.ts`, `supabase/functions/whatsapp-webhook/index.test.ts` … |
| `channel_routing_rules` | Regras de roteamento por canal para fila, com prioridade e condições | ativo | `src/components/omnichannel/ChannelRoutingRules.tsx`, `src/components/omnichannel/__tests__/cadastroSemExecutor.test.tsx`, `src/lib/omnichannel/execucaoDeCanais.ts` |
| `chatbot_executions` | Execuções dos fluxos de chatbot, com nó atual e variáveis | ativo | `src/components/chatbot/ChatbotExecutionsDashboard.tsx` |
| `chatbot_flows` | Fluxos de chatbot (gatilho, nós e publicação) | ativo | `src/components/chatbot/ChatbotExecutionsDashboard.tsx`, `src/components/settings/ChatbotL1Config.tsx`, `src/hooks/__tests__/useChatbotFlows.test.tsx` … |
| `client_wallet_rules` | Regras da carteira de clientes por agente e conexão | ativo | `src/hooks/business/useClientWallet.ts` |
| `connection_health_logs` | Histórico de saúde das conexões (latência, estado e erro) | ativo | `src/components/diagnostics/ConnectionHealthPanel.tsx`, `src/components/monitoring/MonitoringEventTimeline.tsx`, `src/components/monitoring/__tests__/sla-janela-24h.test.tsx` … |
| `contact_custom_fields` | Campos personalizados por contato (nome, valor e tipo) | ativo | `src/components/talkx/TalkXCampaignWizard.tsx`, `src/components/talkx/TalkXWizardDelivery.tsx`, `src/components/talkx/__tests__/talkxSharedPersonalizePreview.test.ts` … |
| `contact_deletion_audit` | Trilha de exclusões de contato (operação, janela e autor) | roadmap | — |
| `contact_identity_map` | Mapa de identidades do WhatsApp (lid ↔ jid) visto no webhook | ativo | `supabase/functions/_shared/evolution-webhook-messages.ts` |
| `contact_notes` | Notas internas do contato, com autor | ativo | `src/components/contacts/ContactActivityTimeline.tsx`, `src/components/contacts/ContactNotes.tsx`, `src/components/contacts/__tests__/ContactNotes.excluirNota.test.tsx` … |
| `contact_purchases` | Histórico de compras do contato (valor, moeda e status) | ativo | `src/components/contacts/ContactPurchaseHistory.tsx`, `src/components/inbox/ContactPurchasesPanel.tsx`, `src/hooks/crm/useContactCrm360.ts` … |
| `contacts` | Cadastro central de contatos (telefone, e-mail, dono e campos de CRM) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/adapters/evolutionAdapter.ts`, `src/components/admin/__tests__/CrisisRoom.metricas.test.tsx` … |
| `conversation_analyses` | Análises de IA da conversa (resumo, sentimento, pontos-chave e risco) | ativo | `src/components/dashboard/AIQuickAccess.tsx`, `src/components/dashboard/SentimentHelpers.tsx`, `src/components/dashboard/SentimentTrendChart.tsx` … |
| `conversation_closures` | Fechamentos de conversa (motivo, desfecho e classificação) | ativo | `src/components/reports/PeriodComparison.tsx`, `src/hooks/analytics/useDashboardData.ts`, `src/hooks/dashboard/useDashboardKpi.ts` … |
| `conversation_events` | Eventos da conversa (transferência, mudança de estado e autor) | ativo | `src/components/contacts/ContactActivityTimeline.tsx`, `src/components/inbox/__tests__/ConversationListSidebar.test.tsx`, `src/hooks/chat/__tests__/useConversationActions.test.ts` … |
| `conversation_memory` | Memória da conversa para a IA (fatos, objeções e promessas) | ativo | `src/hooks/chat/__tests__/useNextBestAction.test.tsx`, `src/hooks/chat/useNextBestAction.ts` |
| `conversation_sla` | Marcos de SLA por conversa (primeira mensagem, primeira resposta, resolução) | ativo | `src/adapters/inboxAdapter.ts`, `src/components/admin/CrisisRoom.tsx`, `src/components/admin/__tests__/CrisisRoom.metricas.test.tsx` … |
| `conversation_snoozes` | Adiamentos de conversa (até quando e por quem) | ativo | `src/components/inbox/chat/useChatPanelHandlers.ts`, `src/hooks/chat/__tests__/useConversationActions.test.ts`, `src/hooks/chat/useConversationActions.ts` … |
| `conversation_tasks` | Tarefas ligadas à conversa (título, responsável e prazo) | ativo | `src/components/inbox/tabs/Crm360Tab.tsx`, `src/hooks/chat/__tests__/useConversationHistoryTimeline.janela.test.tsx`, `src/hooks/chat/__tests__/useConversationHistoryTimeline.test.ts` … |
| `crisis_room_alerts` | Alertas de sala de crise (severidade, métrica, valor e limite) | roadmap | — |
| `crm_contact_links` | Vínculo entre o contato do Zapp e contato/empresa do CRM externo | ativo | `src/components/inbox/__tests__/GlobalSearch.r2-inb-020.test.tsx`, `src/components/inbox/contact-details/sidebar/ContactSidebarSections.tsx`, `src/components/inbox/useGlobalSearchData.ts` … |
| `crm_sync_outbox` | Fila de saída da sincronização com o CRM (payload e idempotência) | ativo | `supabase/functions/crm-integration/index.ts`, `.github/workflows/db-migrate.yml`, `scripts/db-audit/contracts/20260908180000.sql` … |
| `csat_auto_config` | Disparo automático de CSAT (tempo de espera e modelo de mensagem) | ativo | `src/components/settings/CSATAutoConfig.tsx`, `src/components/settings/__tests__/CSATAutoConfig.test.tsx` |
| `csat_surveys` | Respostas de pesquisa CSAT (nota, comentário e agente avaliado) | ativo | `src/hooks/business/useCSAT.ts`, `src/hooks/integrations/useCatalogContactSearch.ts`, `src/services/contact.service.ts` |
| `custom_emojis` | Emojis personalizados disponíveis no chat | ativo | `src/components/settings/MediaLibraryAdmin.tsx`, `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx`, `src/components/settings/media-library/useMediaLibrary.ts` … |
| `deal_activities` | Atividades registradas em uma negociação do CRM | ativo | `src/hooks/chat/useConversationHistoryTimeline.ts`, `src/hooks/crm/useContactCrm360.ts` |
| `department_audit_logs` | Auditoria de alterações em departamento do chat interno | ativo | `src/hooks/team-chat/useDepartmentManagement.ts`, `scripts/db-audit/team-chat-department-whatsapp-safe-config.test.sh`, `scripts/db-tests/04-schema-contracts.sql` … |
| `department_invitations` | Convites de departamento (código, e-mail, papel e validade) | parcial | `scripts/db-audit/migration-evidence.json` |
| `department_invites` | Convites de departamento por código, com validade | ativo | `src/hooks/team-chat/__tests__/departmentInviteCode.random.test.tsx`, `src/hooks/team-chat/__tests__/rls-contract.test.ts`, `src/hooks/team-chat/useDepartmentManagement.ts` … |
| `departments` | Departamentos do chat interno e o modo de WhatsApp de cada um | ativo | `src/components/dashboard/SentimentTrendChart.tsx`, `src/components/team-chat/NewConversationDialog.tsx`, `src/components/team-chat/TeamConversationList.tsx` … |
| `edge_rate_limits` | Contador de requisições por chave nas Edge Functions, em janela | ativo | `supabase/functions/_shared/ai-circuit.test.ts`, `supabase/functions/_shared/ai-circuit.ts`, `supabase/functions/_shared/ai-generate.ts` … |
| `email_attachments` | Anexos de e-mail (arquivo, MIME, tamanho e origem no Gmail) | ativo | `src/hooks/integrations/__tests__/useGmail.historicoPaginacao.test.tsx`, `src/hooks/integrations/useGmail.ts`, `supabase/functions/_shared/gmail-helpers.ts` … |
| `email_labels` | Etiquetas das contas de e-mail conectadas | ativo | `src/hooks/integrations/useGmail.ts`, `supabase/functions/_shared/gmail-helpers.ts`, `e2e/fixtures/email-navy.ts` |
| `email_messages` | Mensagens de e-mail (remetente, destinatários, corpo e estado) | ativo | `src/components/email/__tests__/EmailVolumeMedicao.test.tsx`, `src/components/gmail/__tests__/EmailThreadView.test.tsx`, `src/hooks/gmail/__tests__/useContactUnreadEmails.test.tsx` … |
| `email_threads` | Conversas de e-mail, vinculadas ao contato quando identificado | ativo | `src/components/admin/GmailWebhookMonitor.tsx`, `src/components/admin/__tests__/GmailWebhookMonitor.falha-consulta.test.tsx`, `src/components/email/__tests__/EmailVolumeMedicao.test.tsx` … |
| `entity_versions` | Versionamento genérico de entidades (tipo, id e cópia dos dados) | ativo | `src/hooks/system/useVersions.ts` |
| `favorite_contacts` | Contatos favoritados por usuário | ativo | `src/components/inbox/chat/useChatPanelHandlers.ts`, `src/hooks/chat/__tests__/useConversationActions.test.ts`, `src/hooks/chat/useConversationActions.ts` … |
| `feature_flags` | Chaves de funcionalidade ligadas/desligadas | ativo | `src/hooks/contacts/__tests__/ContactsView.v2Flags.test.tsx`, `src/hooks/contacts/__tests__/useContactsV2Flags.test.tsx`, `src/hooks/contacts/useContactsV2Flags.ts` … |
| `followup_executions` | Execuções de sequência de follow-up, com passo atual e estado | ativo | `src/components/settings/FollowUpExecutionsHistory.tsx` |
| `followup_sequences` | Sequências de follow-up (evento-gatilho e conexão de envio) | ativo | `src/components/settings/FollowUpExecutionsHistory.tsx`, `src/components/settings/FollowUpSequences.tsx` |
| `followup_steps` | Passos das sequências de follow-up (ordem, espera e modelo de mensagem) | ativo | `src/components/settings/FollowUpSequences.tsx` |
| `geo_blocking_settings` | Modo do bloqueio geográfico (desligado, lista branca ou lista negra) | ativo | `src/hooks/system/useGeoBlocking.ts`, `scripts/db-audit/network-policy-rpc.test.sh` |
| `global_settings` | Configurações globais chave-valor do sistema | ativo | `src/components/connections/ConnectionsView.tsx`, `src/components/settings/AutomationSettings.tsx`, `src/components/settings/GlobalSettingsSection.tsx` … |
| `gmail_accounts` | Contas Gmail conectadas (endereço, tokens cifrados e estado de sincronização) | ativo | `supabase/functions/_shared/__tests__/gmail-cursor-cas-db.test.ts`, `supabase/functions/_shared/__tests__/gmail-helpers-account-scope.test.ts`, `supabase/functions/_shared/__tests__/gmail-helpers.test.ts` … |
| `goals_configurations` | Metas por agente ou fila (diária, semanal e tipo) | ativo | `src/components/dashboard/GoalsConfigDialog.tsx`, `src/components/dashboard/__tests__/GoalsConfigDialog.test.tsx`, `src/hooks/__tests__/useGoalNotifications.goal-types.test.ts` … |
| `ip_whitelist` | IPs liberados, com descrição e autor | ativo | `src/components/security/IPWhitelistPanel.tsx`, `scripts/db-audit/network-policy-rpc.test.sh` |
| `knowledge_base_articles` | Artigos da base de conhecimento usada pela IA e pelo chatbot | ativo | `src/components/settings/ChatbotL1Config.tsx`, `src/hooks/integrations/useKnowledgeBase.ts`, `supabase/functions/ai-suggest-reply/index.ts` … |
| `knowledge_base_files` | Arquivos anexados aos artigos da base de conhecimento | ativo | `src/hooks/integrations/useKnowledgeBase.ts`, `.github/workflows/db-migrate.yml`, `scripts/db-audit/contracts/20260831150000.sql` |
| `link_preview_cache` | Cache da prévia de links, com validade por hash de URL | ativo | `supabase/functions/fetch-link-preview/index.ts` |
| `link_preview_cache_metrics` | Métricas de limpeza do cache de prévia (removidos, restantes e tempo) | roadmap | — |
| `login_attempts` | Tentativas de login por e-mail e IP, base do bloqueio de conta | ativo | `supabase/functions/auth-login/index.test.ts`, `scripts/db-audit/scope-public-policies-authenticated.test.sh` |
| `message_reactions` | Reações em mensagens do chat | ativo | `src/hooks/__tests__/useMessageReactions.test.tsx`, `src/hooks/chat/__tests__/useMessageReactions.transport-rejection.test.tsx`, `src/hooks/chat/useMessageReactions.ts` … |
| `message_templates` | Modelos de mensagem e atalhos do usuário | ativo | `src/components/onboarding/checklistSteps.ts`, `src/hooks/__tests__/useOnboardingChecklist.test.tsx`, `src/hooks/chat/useMessageTemplates.ts` … |
| `messages` | Mensagens de conversa (contato, conexão, remetente, conteúdo e tipo) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/__tests__/smoke.test.ts`, `src/adapters/evolutionAdapter.ts` … |
| `meta_capi_events` | Eventos enviados à Meta Conversions API (nome, hora e origem) | ativo | `src/hooks/integrations/useMetaCAPIData.ts` |
| `mfa_sessions` | Sessões com segundo fator verificado | roadmap | — |
| `multiplix_audience_members` | Membros de audiência Multiplix (empresa e contato do Singu) | parcial | `scripts/db-audit/multiplix-delivery-leases.test.sh`, `scripts/db-audit/multiplix-rls.test.sh` |
| `multiplix_audiences` | Audiências Multiplix (definição, dono e compartilhamento por papel) | parcial | `scripts/db-audit/multiplix-delivery-leases.test.sh`, `scripts/db-audit/multiplix-rls.test.sh` |
| `multiplix_blocks` | Blocos de um disparo Multiplix (ordem, tipo e conteúdo) | ativo | `supabase/functions/_shared/multiplix-content.ts`, `supabase/functions/multiplix-dispatch/actions/__tests__/blocks.test.ts`, `supabase/functions/multiplix-dispatch/actions/__tests__/inspect.test.ts` … |
| `multiplix_delivery_items` | Itens de entrega do disparo Multiplix (destinatário, bloco e estado) | ativo | `supabase/functions/_shared/evolution-webhook-messages.ts`, `supabase/functions/_shared/evolution-webhook-msg-handlers.ts`, `supabase/functions/_shared/multiplix-content.ts` … |
| `multiplix_dispatches` | Disparos Multiplix (modelo, mídia, estado e versão) | ativo | `src/components/multiplix/MultiplixMonitor.tsx`, `src/hooks/integrations/useMultiplixDispatches.ts`, `supabase/functions/multiplix-dispatch/__tests__/draft.test.ts` … |
| `multiplix_events` | Eventos do disparo Multiplix (tipo e payload) | ativo | `supabase/functions/multiplix-send/index.test.ts`, `supabase/functions/multiplix-send/index.ts`, `scripts/db-audit/multiplix-delivery-leases.test.sh` … |
| `multiplix_recipients` | Destinatários do disparo Multiplix (empresa, destino e trilha de versão) | ativo | `src/components/multiplix/MultiplixMonitor.tsx`, `src/hooks/integrations/useMultiplixDispatches.ts`, `supabase/functions/_shared/evolution-webhook-messages.ts` … |
| `multiplix_voice_assets` | Áudios de voz gerados para o Multiplix (hash, caminho e modelo) | ativo | `supabase/functions/multiplix-send/index.test.ts`, `supabase/functions/multiplix-send/index.ts`, `supabase/functions/multiplix-voices/index.test.ts` … |
| `multiplix_voice_grants` | Autorização de uso das vozes por papel e perfil | ativo | `supabase/functions/multiplix-voices/index.test.ts`, `supabase/functions/multiplix-voices/index.ts`, `scripts/db-audit/f64-voz-assets-e-grants.test.sh` |
| `notifications` | Notificações do usuário (título, tipo e leitura) | ativo | `src/App.tsx`, `src/components/layout/Sidebar.tsx`, `src/components/layout/__tests__/Sidebar.test.tsx` … |
| `nps_surveys` | Respostas de pesquisa NPS (nota, comentário e agente avaliado) | ativo | `src/hooks/business/useNPSSurveys.ts` |
| `number_reputation` | Reputação do número por conexão (saúde, envios, falhas e reclamações) | ativo | `src/components/connections/NumberReputationMonitor.tsx`, `src/components/connections/__tests__/NumberReputationMonitor.test.tsx` |
| `passkey_credentials` | Credenciais WebAuthn (passkeys) do usuário | ativo | `src/hooks/auth/useWebAuthn.ts`, `supabase/functions/webauthn/index.ts` |
| `password_reset_requests` | Pedidos de redefinição de senha (motivo, estado e revisor) | ativo | `src/pages/ForgotPassword.tsx`, `supabase/functions/approve-password-reset/index.ts` |
| `payment_links` | Links de pagamento (valor, moeda e estado) | ativo | `src/hooks/payments/usePaymentLinks.ts`, `scripts/db-audit/global-guards-regression.test.mjs` |
| `performance_snapshots` | Amostras de performance da tela (FCP, TTFB e tempos de carga) | ativo | `src/hooks/analytics/__tests__/usePerformanceSnapshots.limpeza.test.tsx`, `src/hooks/analytics/usePerformanceSnapshots.ts` |
| `permissions` | Permissões do sistema (nome, categoria e descrição) | ativo | `src/__tests__/security-and-performance.test.ts`, `src/components/CommandPalette.tsx`, `src/components/a11y/__tests__/CustomModalFocus.test.tsx` … |
| `pinned_conversations` | Conversas fixadas pelo usuário, com posição | ativo | `src/hooks/chat/__tests__/useConversationActions.test.ts`, `src/hooks/chat/useConversationActions.ts`, `src/hooks/inbox/__tests__/useInboxFilters.snooze-consumo.test.tsx` … |
| `playbooks` | Playbooks de atendimento (categoria, passos e publicação) | ativo | `src/components/admin/AdminView.tsx`, `src/components/admin/PlaybooksManager.tsx`, `scripts/ci/check-remocoes-destrutivas.unit.mjs` … |
| `products` | Produtos do catálogo interno (preço, imagem e estado) | ativo | `src/components/catalog/CatalogBulkSendDialog.tsx`, `src/components/catalog/CatalogProductCard.tsx`, `src/components/catalog/CatalogRail.tsx` … |
| `profiles` | Perfis dos usuários e agentes (nome, papel e papel no atendimento) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/admin/CrisisRoom.tsx`, `src/components/admin/ForceLogoutButton.tsx` … |
| `query_telemetry` | Telemetria das operações de banco feitas pelo app (operação, tabela e duração) | ativo | `src/pages/AdminTelemetriaPage.tsx`, `src/pages/admin-telemetria/__tests__/AdminTelemetriaPage.leitura-falha.test.tsx`, `supabase/functions/external-db-bridge/index.ts` |
| `queue_goals` | Metas por fila (espera máxima, média de espera e taxa de atribuição) | ativo | `src/components/queues/__tests__/QueueGoalsDialog.salvarMetas.test.tsx`, `src/components/queues/__tests__/QueuesView.editar.test.tsx`, `src/components/queues/__tests__/QueuesView.test.tsx` … |
| `queue_members` | Agentes vinculados a cada fila | ativo | `src/components/agents/__tests__/AgentsView.capacidade.test.tsx`, `src/components/queues/__tests__/QueuesView.editar.test.tsx`, `src/components/queues/__tests__/QueuesView.test.tsx` … |
| `queue_positions` | Posição do contato na fila, com espera estimada | ativo | `src/components/inbox/QueuePositionNotifier.tsx` |
| `queue_skill_requirements` | Habilidade mínima exigida por fila | ativo | `src/components/settings/SkillBasedRoutingSettings.tsx`, `src/components/settings/__tests__/SkillBasedRoutingSettings.test.tsx` |
| `queues` | Filas de atendimento (cor, tempo máximo de espera e estado) | ativo | `src/components/admin/SupervisorCopilot.tsx`, `src/components/agents/AgentsView.tsx`, `src/components/agents/__tests__/AgentsView.actions.test.tsx` … |
| `rate_limit_configs` | Configurações de limite de requisições por padrão de endpoint | ativo | `src/components/security/RateLimitConfigPanel.tsx`, `src/components/security/__tests__/RateLimitConfigPanel.test.tsx`, `scripts/db-audit/network-policy-rpc.test.sh` |
| `rate_limit_logs` | Registros de requisições limitadas ou bloqueadas | ativo | `src/hooks/system/useRateLimitLogs.ts`, `supabase/functions/cleanup-rate-limit-logs/index.test.ts`, `supabase/functions/cleanup-rate-limit-logs/index.ts` |
| `reminders` | Lembretes por contato e usuário, com horário | ativo | `src/components/inbox/RealtimeInboxView.tsx`, `src/components/inbox/__tests__/ConversationTabs.test.tsx`, `src/components/inbox/chat/__tests__/ConversationTabs.test.tsx` … |
| `role_permissions` | Permissões associadas a cada papel | ativo | `src/hooks/__tests__/usePermissions.test.tsx`, `src/hooks/__tests__/useUserRole.test.tsx`, `src/hooks/system/usePermissions.ts` … |
| `sales_deals` | Negociações do pipeline de vendas (valor, etapa e contato) | ativo | `src/components/inbox/tabs/OpenDealsList.tsx`, `src/hooks/chat/__tests__/useConversationHistoryTimeline.janela.test.tsx`, `src/hooks/chat/useConversationHistoryTimeline.ts` … |
| `sales_pipeline_stages` | Etapas do pipeline de vendas (ordem, cor e estado) | ativo | `src/hooks/crm/useContactCrm360.ts` |
| `saved_filters` | Filtros salvos pelo usuário por tipo de entidade | ativo | `src/hooks/chat/useSavedFilters.ts` |
| `scheduled_messages` | Mensagens agendadas (conteúdo, mídia e horário) | ativo | `src/hooks/chat/useScheduledMessages.ts`, `src/test/mocks/scheduledMessagesServer.ts`, `.github/workflows/db-migrate.yml` … |
| `scheduled_report_configs` | Configuração de relatórios agendados pela tela (frequência e destinatários) | ativo | `src/components/reports/ScheduledReportConfigs.tsx`, `src/hooks/dashboard/useScheduledReportConfigs.ts`, `scripts/ci/dashboard-readme-drift.unit.mjs` |
| `scheduled_reports` | Relatórios agendados (tipo, frequência, destinatários e formato) | ativo | `src/hooks/chat/useScheduledReports.ts`, `supabase/functions/send-scheduled-report/index.test.ts`, `supabase/functions/send-scheduled-report/index.ts` |
| `security_alerts` | Alertas de segurança (tipo, severidade e IP de origem) | ativo | `src/components/security/RateLimitRealtimeAlerts.tsx`, `src/components/security/SecurityOverview.tsx`, `src/hooks/system/useSecurityPushNotifications.ts` … |
| `sicoob_contact_mapping` | Mapeamento entre contato do Zapp, usuário Sicoob e agente | roadmap | — |
| `sla_configurations` | Configurações de SLA (tempo de primeira resposta e de resolução) | ativo | `src/hooks/sla/useApplicableSLA.ts`, `src/hooks/sla/useSLAConfigurations.ts`, `scripts/db-audit/sla-first-response-delivery-contract.test.mjs` |
| `sla_rules` | Regras de SLA por prioridade, fila ou contato | ativo | `src/components/settings/SLARulesManager.tsx`, `src/hooks/sla/__tests__/useApplicableSLA.test.tsx`, `src/hooks/sla/useApplicableSLA.ts` … |
| `stickers` | Figurinhas do chat, por categoria e autor | ativo | `src/components/inbox/StickerPicker.tsx`, `src/components/inbox/__tests__/StickerPicker.catalogo.test.tsx`, `src/components/inbox/chat/MessageBubble.tsx` … |
| `talkx_alerts` | Alertas do motor TalkX (tipo, campanha e payload) | parcial | `scripts/db-audit/talkx-engine-health.test.sh`, `scripts/db-audit/talkx-expurgo-escopo-ai-jobs.test.sh`, `scripts/db-audit/talkx-tick-expurgo.test.sh` |
| `talkx_blacklist` | Lista de supressão do TalkX (contato, motivo e origem) | ativo | `src/components/talkx/TalkXSuppression.tsx`, `src/components/talkx/__tests__/TalkXSuppression.authoring.test.tsx`, `src/components/talkx/__tests__/useCampaignEditor.test.tsx` … |
| `talkx_campaign_events` | Eventos de campanha TalkX (tipo, mensagem e ator) | ativo | `src/hooks/integrations/useTalkXEvents.ts`, `supabase/functions/talkx-scheduler/index.test.ts`, `supabase/functions/talkx-send/_test-utils.ts` … |
| `talkx_campaign_segments` | Segmentos usados por cada campanha TalkX, em ordem | parcial | `scripts/db-audit/talkx-campaign-segments.test.sh` |
| `talkx_campaigns` | Campanhas TalkX (modelo, variáveis, ritmo de digitação e estado) | ativo | `src/components/talkx/TalkXLiveMonitor.tsx`, `src/components/talkx/__tests__/TalkXLiveMonitor.states.test.tsx`, `src/components/talkx/kit/__tests__/talkxStates.matrix.test.tsx` … |
| `talkx_conversions` | Conversões atribuídas aos links das campanhas TalkX | parcial | `scripts/db-audit/talkx-e90-links-contract.test.mjs`, `scripts/db-audit/talkx-links-conversions.test.sh` |
| `talkx_delivery_log` | Log de entrega das campanhas TalkX (tentativa, etapa e desfecho) | ativo | `supabase/functions/talkx-send/_test-utils.ts`, `supabase/functions/talkx-send/index.ts`, `supabase/functions/talkx-send/r3-delta-011-excecao-nao-perde-log.test.ts` … |
| `talkx_link_clicks` | Cliques nos links das campanhas TalkX | ativo | `src/hooks/integrations/__tests__/useTalkXInsights.defeito-223.test.tsx`, `src/hooks/integrations/__tests__/useTalkXInsights.test.ts`, `src/hooks/integrations/useTalkXInsights.ts` … |
| `talkx_links` | Links com slug usados nas campanhas TalkX | ativo | `src/hooks/integrations/__tests__/useTalkXInsights.defeito-223.test.tsx`, `src/hooks/integrations/__tests__/useTalkXInsights.engajamento.test.tsx`, `src/hooks/integrations/__tests__/useTalkXInsights.test.ts` … |
| `talkx_optout_keywords` | Palavras de descadastro reconhecidas pelo TalkX | ativo | `supabase/functions/_shared/__tests__/talkx-webhook-optout.test.ts`, `supabase/functions/_shared/__tests__/talkx-webhook-reply.test.ts`, `supabase/functions/_shared/evolution-webhook-messages.ts` … |
| `talkx_recipients` | Destinatários da campanha TalkX (mensagem personalizada e estado) | ativo | `src/components/talkx/TalkXAnalytics.tsx`, `src/components/talkx/TalkXCampaignRunning.tsx`, `src/components/talkx/TalkXLiveMonitor.tsx` … |
| `talkx_segments` | Segmentos de audiência reutilizáveis do TalkX | ativo | `src/components/talkx/__tests__/TalkXSegments.builder.test.tsx`, `src/components/talkx/useCampaignEditor.ts`, `src/hooks/integrations/useTalkXSegments.ts` … |
| `talkx_settings` | Configurações chave-valor do TalkX | ativo | `src/hooks/integrations/useTalkXSettings.ts`, `supabase/functions/_shared/__tests__/talkx-resume-policy.test.ts`, `supabase/functions/_shared/__tests__/talkx-v20-window-business-hours.test.ts` … |
| `talkx_template_variants` | Variantes de template do TalkX (rótulo, conteúdo e mídia) | ativo | `src/hooks/integrations/useTalkXTemplates.ts`, `supabase/functions/talkx-send/index.ts`, `supabase/functions/talkx-send/process-recipient.ts` … |
| `talkx_template_versions` | Histórico de versões dos templates do TalkX | ativo | `src/components/talkx/useCampaignEditor.ts`, `src/hooks/integrations/useTalkX.ts`, `src/hooks/integrations/useTalkXTemplates.ts` … |
| `talkx_templates` | Templates de mensagem do TalkX (categoria, conteúdo e mídia) | ativo | `src/components/talkx/__tests__/useCampaignEditor.test.tsx`, `src/components/talkx/useCampaignEditor.ts`, `src/hooks/integrations/useTalkXTemplates.ts` … |
| `talkx_test_send_claims` | Reservas de envio de teste do TalkX, por chave de requisição | ativo | `supabase/functions/talkx-send/index.test.ts`, `supabase/functions/talkx-send/index.ts`, `scripts/db-audit/talkx-expurgo-escopo-ai-jobs.test.sh` … |
| `team_conversation_members` | Participantes das conversas do chat interno, com leitura e silêncio | ativo | `src/components/team-chat/__tests__/useTeamChatPanel.mute.test.tsx`, `src/components/team-chat/useTeamChatPanel.ts`, `src/hooks/__tests__/useTeamChatNotifications.behavior.test.ts` … |
| `team_conversations` | Conversas do chat interno (tipo, nome e criador) | ativo | `src/hooks/team-chat/useTeamChatMutations.ts`, `src/hooks/team-chat/useTeamConversations.ts`, `.github/workflows/db-guard.yml` … |
| `team_message_reactions` | Reações nas mensagens do chat interno | ativo | `src/hooks/team-chat/useTeamMessageReactions.ts`, `scripts/db-audit/global-guards-regression.test.mjs`, `scripts/db-audit/migration-evidence.json` … |
| `team_message_receipts` | Recibos de entrega e leitura das mensagens do chat interno | ativo | `src/hooks/team-chat/__tests__/useTeamMessages.read-state.test.tsx`, `src/hooks/team-chat/__tests__/useTeamMessages.test.tsx`, `src/hooks/team-chat/useTeamConversations.ts` … |
| `team_messages` | Mensagens do chat interno (autor, conteúdo e resposta) | ativo | `src/components/team-chat/__tests__/team-chat-comprehensive.test.ts`, `src/components/team-chat/useTeamChatPanel.ts`, `src/hooks/chat/useTeamChatNotifications.ts` … |
| `training_sessions` | Sessões de treinamento de agente (cenário, mensagens e nota) | ativo | `src/components/admin/TrainingMode.tsx`, `src/components/admin/__tests__/TrainingMode.avaliacao.test.tsx` |
| `user_devices` | Dispositivos do usuário (impressão digital, navegador e sistema) | ativo | `src/hooks/__tests__/useDeviceDetection.test.tsx`, `src/hooks/ui/useDeviceDetection.ts`, `supabase/functions/detect-new-device/index.ts` |
| `user_roles` | Papéis atribuídos a cada usuário | ativo | `src/components/admin/VisibilityGrantsManager.tsx`, `src/components/admin/__tests__/useAdminDataRoleChange.test.ts`, `src/components/admin/useAdminData.ts` … |
| `user_service_accounts` | Contas de serviço do usuário (tipo, e-mail e estado) | ativo | `supabase/functions/create-user/index.ts` |
| `user_sessions` | Sessões do usuário (dispositivo, IP, agente e estado) | ativo | `src/hooks/__tests__/useDeviceDetection.test.tsx`, `src/hooks/ui/useDeviceDetection.ts`, `supabase/functions/detect-new-device/index.ts` … |
| `user_settings` | Preferências do usuário (horário de trabalho, notificações e canais) | ativo | `src/components/monitoring/hooks/useMonitoringNotifications.ts`, `src/components/notifications/SoundVolumeControl.tsx`, `src/components/onboarding/__tests__/OnboardingChecklist.test.tsx` … |
| `voice_command_logs` | Comandos de voz registrados (transcrição, ação e resposta) | ativo | `src/hooks/voice/logVoiceCommand.ts` |
| `warroom_alerts` | Alertas do war-room (tipo, origem e leitura) | ativo | `src/hooks/__tests__/useWarRoomAlerts.test.tsx`, `src/hooks/business/useWarRoomAlerts.ts`, `supabase/functions/_shared/__tests__/evolution-connection-state.test.ts` … |
| `webauthn_challenges` | Desafios WebAuthn pendentes, com validade | ativo | `supabase/functions/webauthn/index.ts` |
| `webhook_failures` | Falhas de webhook registradas (endpoint, evento e payload truncado) | parcial | `.github/workflows/db-migrate.yml`, `scripts/db-audit/check-webhook-failures-acl.sql`, `scripts/db-audit/check-webhook-failures-acl.test.sh` … |
| `webhook_rate_limits` | Contador de webhooks por instância e tipo de evento, em janela | roadmap | — |
| `whatsapp_connection_queues` | Vínculo entre conexão de WhatsApp e fila de atendimento | ativo | `src/hooks/__tests__/useConnectionQueues.test.tsx`, `src/hooks/inbox/useConnectionQueues.ts`, `scripts/db-audit/enqueue-connection-scope.test.sh` … |
| `whatsapp_connections` | Conexões de WhatsApp (instância, telefone, estado e QR) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/alerts/EvolutionDisconnectBanner.tsx`, `src/components/connections/NumberReputationMonitor.tsx` … |
| `whatsapp_flows` | Fluxos do WhatsApp (JSON de telas e publicação) | ativo | `src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `whatsapp_groups` | Grupos de WhatsApp conhecidos, com participantes | ativo | `src/hooks/chat/useForwardMedia.ts`, `src/hooks/chat/useForwardMessage.ts`, `src/hooks/chat/useGroupsManager.ts` … |
| `whatsapp_templates` | Modelos de mensagem do WhatsApp (categoria, idioma e conteúdo) | ativo | `src/hooks/integrations/useWhatsAppTemplates.ts` |
| `whisper_messages` | Mensagens sussurradas entre agentes dentro de uma conversa | ativo | `src/components/inbox/WhisperMode.tsx` |

## Nota histórica

A auditoria de 28/08/2026 (§8) mediu o mesmo tipo de acoplamento. Cruzando com o que este
inventário apura hoje:

- `crisis_room_alerts` e `webhook_rate_limits` (§8.1, "sem NENHUMA referência de código") estão
  aqui como `roadmap`. A consolidação das duas continua pendente (etapas 71–72 da auditoria).
- `link_preview_cache_metrics` e `mfa_sessions` (§8.2, "via de escrita ausente ou acoplamento
  mínimo") também estão como `roadmap`: nenhum arquivo do repositório as cita — o efeito que a
  auditoria descrevia (limpeza por cron, policy esperando o produtor) vive no banco, não aqui.
- `ai_budget_reservations`, `department_invitations`, `multiplix_audience_members`,
  `multiplix_audiences`, `talkx_alerts`, `talkx_campaign_segments`, `talkx_conversions` e
  `webhook_failures` são `parcial`: só o ferramental (`scripts/db-audit/`, `scripts/qa/`,
  `.github/workflows/`) as cita.

As contagens de 28/08 (124 tabelas) são históricas; o catálogo de hoje tem 166.
