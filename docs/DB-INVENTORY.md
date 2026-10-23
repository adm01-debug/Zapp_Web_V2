# Inventário de objetos do banco — `public`

**Fonte de verdade:** `supabase/schema-catalog.json` — snapshot versionado de `postgres`.`public`
(campo `generated_at`: 2026-10-16, regenerado por
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
| Tabelas (`tables`) | 171 |
| Views (`views`) | 12 |
| Colunas (`columns`) | 1999 |
| Funções (`functions`) | 279 |
| Assinaturas de função (`function_signatures`) | 280 |
| Funções de gatilho (`trigger_functions`) | 72 |
| Restrições de verificação (`check_constraints`) | 168 |

As tabelas estão inventariadas uma a uma na seção seguinte. Views, funções, colunas e restrições
têm o inventário completo no catálogo (`supabase/schema-catalog.json`) e o manifesto com hash de
RLS em `supabase/schema-manifest.json`; este documento não os repete.

## Tabelas
| Tabela | Propósito | Status | Consumidores conhecidos |
|---|---|---|---|
| `agent_achievements` | Conquistas de gamificação do agente (tipo, nome e XP ganho) | ativo | `src/components/gamification/AchievementsSystem.tsx`, `src/components/gamification/__tests__/AchievementToast.test.tsx`, `src/components/gamification/__tests__/AchievementsSystem.test.tsx` … |
| `agent_presence` | Presença do agente (status e carimbo de atualização) | ativo | `src/components/admin/CrisisRoom.tsx`, `src/components/admin/__tests__/CrisisRoom.metricas.test.tsx`, `src/components/agents/__tests__/AgentsView.capacidade.test.tsx` … |
| `agent_skills` | Habilidades cadastradas por agente, base do roteamento por skill | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/settings/SkillBasedRoutingSettings.tsx`, `src/components/settings/__tests__/SkillBasedRoutingSettings.skills-assign.test.tsx` … |
| `agent_stats` | Agregado de gamificação do agente (XP, nível, enviadas, conquistas) | ativo | `src/components/dashboard/AgentPerformancePanel.tsx`, `src/components/gamification/AchievementsStats.tsx`, `src/components/gamification/AchievementsSystem.tsx` … |
| `agent_visibility_grants` | Concessões de visibilidade de um agente sobre outro | ativo | `src/components/admin/VisibilityGrantsManager.tsx`, `src/components/admin/__tests__/VisibilityGrantsManager.a11y.test.tsx`, `scripts/db-audit/crm-sync-outbox-behavior.test.sh` … |
| `ai_budget_reservations` | Reserva de tokens/orçamento por execução de função de IA | parcial | `scripts/qa/prova-orcamento-rate-limit.sh` |
| `ai_conversation_tags` | Tags sugeridas pela IA em conversa/contato, com confiança e origem | ativo | `src/components/docs/__tests__/SystemFeaturesView.test.tsx`, `src/hooks/crm/__tests__/useContactEnrichedData.test.tsx`, `src/services/contact.service.ts` … |
| `ai_jobs` | Fila de jobs de IA (payload, idempotência, tentativas e estado) | ativo | `src/lib/aiJobs/status.ts`, `supabase/functions/_shared/__tests__/effect-reconcile.test.ts`, `supabase/functions/_shared/ai-jobs.ts` … |
| `ai_model_prices` | Preço por fornecedor/modelo e unidade de cobrança de IA | ativo | `supabase/functions/_shared/ai-usage.ts`, `supabase/functions/talkx-ai/index.test.ts`, `supabase/functions/talkx-ai/index.ts` … |
| `ai_providers` | Fornecedores de IA cadastrados (endpoint, modelo e referência do segredo) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/dashboard/__tests__/AIToolsCard.test.tsx`, `src/components/dashboard/overview/AIToolsCard.tsx` … |
| `ai_usage_logs` | Log de uso de IA por chamada (tokens, modelo e função) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/admin/__tests__/AIUsageDashboard.estado-a11y.test.tsx`, `src/components/inbox/AIConversationAssistant.tsx` … |
| `allowed_countries` | Países liberados no bloqueio geográfico | ativo | `src/components/security/__tests__/GeoBlockingPanel.confirmacao.test.tsx`, `src/hooks/system/__tests__/useGeoBlocking.test.ts`, `src/hooks/system/useGeoBlocking.ts` … |
| `audio_meme_favorites` | Áudios e memes favoritados por usuário | ativo | `src/hooks/communication/__tests__/useAudioMemes.realtime.test.tsx`, `src/hooks/communication/useAudioMemes.ts` |
| `audio_memes` | Biblioteca de áudios e memes disponíveis no chat | ativo | `src/components/settings/MediaLibraryAdmin.tsx`, `src/components/settings/__tests__/MediaLibraryAdmin.resolucao.test.tsx`, `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx` … |
| `audit_logs` | Trilha de auditoria de ações do sistema (usuário, ação, entidade) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/admin/__tests__/MediaMigrationTool.test.tsx`, `src/components/admin/__tests__/useAdminData.erros-auditoria.test.ts` … |
| `auto_close_config` | Configuração do fechamento automático por inatividade da conversa | ativo | `src/components/settings/AutomationSettings.tsx`, `src/hooks/__tests__/useUserSettings.test.tsx`, `src/hooks/inbox/useAutoCloseConversations.ts` … |
| `automations` | Automações client-side (gatilho, configuração e estado) | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/__tests__/CT70_reduzirMovimentoAutomacaoIa.test.tsx`, `src/components/automations/AutomationsManager.tsx` … |
| `away_messages` | Mensagens de ausência por conexão de WhatsApp | ativo | `src/components/settings/MessagesSettings.tsx`, `src/components/settings/__tests__/MessagesSettings.test.tsx`, `src/hooks/__tests__/useUserSettings.test.tsx` … |
| `blocked_countries` | Países bloqueados no bloqueio geográfico, com motivo | ativo | `src/hooks/system/__tests__/useGeoBlocking.test.ts`, `src/hooks/system/useGeoBlocking.ts`, `scripts/db-audit/network-policy-rpc.test.sh` … |
| `blocked_ips` | IPs bloqueados, com motivo, autor e validade | ativo | `src/__tests__/rls-boundary.test.ts`, `src/components/security/BlockedIPDialogs.tsx`, `src/components/security/BlockedIPsPanel.tsx` … |
| `business_hours` | Horário de funcionamento por conexão (dia, abertura e fechamento) | ativo | `src/components/automations/__tests__/AutomationEditorDialog.test.tsx`, `src/components/automations/automationConstants.ts`, `src/components/connections/BusinessHoursIndicator.tsx` … |
| `calls` | Ligações registradas (contato, agente, conexão, direção e desfecho) | ativo | `src/App.tsx`, `src/__tests__/a11y/icon-buttons-baseline.json`, `src/__tests__/smoke.test.ts` … |
| `campaign_ab_variants` | Variantes A/B de uma campanha, com contadores de envio | roadmap | — |
| `campaign_contacts` | Destinatários da campanha e estado do envio de cada um | parcial | `scripts/db-audit/anon-privileges-contact-messages.test.sh`, `scripts/db-audit/inbox-contact-authorization.test.sh` |
| `campaigns` | Campanhas de mensagem (conteúdo, mídia e configuração de disparo) | ativo | `src/components/keyboard/__tests__/paleta-unica.test.tsx`, `src/components/mobile/__tests__/MobileHeader.titulos.test.tsx`, `src/components/talkx/TalkXAnalytics.tsx` … |
| `catalog_favorites` | Produtos do catálogo externo favoritados pelo usuário | ativo | `src/components/catalog/ExternalProductCatalog.tsx`, `src/components/catalog/__tests__/ExternalProductCatalog.test.tsx`, `src/components/catalog/__tests__/R2MOD048_favoritoCard.test.tsx` … |
| `catalog_rate_limit_hits` | Contadores de uso do catálogo por usuário e ação, em janela | parcial | `scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh` |
| `catalog_rate_limits` | Limite de uso do catálogo por usuário e ação | ativo | `supabase/functions/promogifts-catalog/index.ts` |
| `catalog_send_events` | Histórico de envios de produto do catálogo por contato | ativo | `src/components/catalog/CatalogRail.tsx`, `src/components/catalog/ContactSelectionStep.tsx`, `src/components/catalog/ExternalProductCatalog.tsx` … |
| `channel_connections` | Conexões de canal (WhatsApp e omnichannel): identidade, estado e credenciais | ativo | `src/components/omnichannel/OmnichannelManager.tsx`, `src/lib/omnichannel/execucaoDeCanais.ts`, `supabase/functions/whatsapp-webhook/index.test.ts` … |
| `channel_routing_rules` | Regras de roteamento por canal para fila, com prioridade e condições | ativo | `src/components/omnichannel/ChannelRoutingRules.tsx`, `src/components/omnichannel/__tests__/ChannelRoutingRules.a11y.test.tsx`, `src/components/omnichannel/__tests__/cadastroSemExecutor.test.tsx` … |
| `chatbot_executions` | Execuções dos fluxos de chatbot, com nó atual e variáveis | ativo | `src/components/chatbot/ChatbotExecutionsDashboard.tsx`, `src/components/chatbot/ChatbotHonestNotice.tsx` |
| `chatbot_flows` | Fluxos de chatbot (gatilho, nós e publicação) | ativo | `src/components/chatbot/ChatbotExecutionsDashboard.tsx`, `src/components/chatbot/ChatbotHonestNotice.tsx`, `src/components/settings/ChatbotL1Config.tsx` … |
| `client_wallet_rules` | Regras da carteira de clientes por agente e conexão | ativo | `src/hooks/business/__tests__/useClientWallet.test.tsx`, `src/hooks/business/useClientWallet.ts` |
| `connection_alert_preferences` | Preferências de alerta de saúde da conexão por usuário. | ativo | `src/components/alerts/__tests__/EvolutionDisconnectBanner.a11y.test.tsx`, `src/components/alerts/__tests__/EvolutionDisconnectBanner.behavior.test.tsx`, `src/components/alerts/__tests__/EvolutionDisconnectBanner.janela-manutencao.test.tsx` … |
| `connection_health_logs` | Histórico de saúde das conexões (latência, estado e erro) | ativo | `src/components/diagnostics/ConnectionHealthPanel.tsx`, `src/components/diagnostics/__tests__/DiagnosticsView.health.test.tsx`, `src/components/monitoring/MonitoringEventTimeline.tsx` … |
| `contact_custom_fields` | Campos personalizados por contato (nome, valor e tipo) | ativo | `src/components/talkx/TalkXCampaignWizard.tsx`, `src/components/talkx/TalkXWizardDelivery.tsx`, `src/components/talkx/__tests__/talkxSharedPersonalizePreview.test.ts` … |
| `contact_deletion_audit` | Trilha de exclusões de contato (operação, janela e autor) | roadmap | — |
| `contact_identity_map` | Mapa de identidades do WhatsApp (lid ↔ jid) visto no webhook | ativo | `supabase/functions/_shared/evolution-webhook-messages.ts`, `scripts/db-audit/anon-privileges-contact-messages.test.sh`, `scripts/db-audit/inbox-contact-authorization.test.sh` |
| `contact_notes` | Notas internas do contato, com autor | ativo | `src/components/contacts/ContactActivityTimeline.tsx`, `src/components/contacts/ContactNotes.tsx`, `src/components/contacts/__tests__/ContactActivityTimeline.eventos.test.tsx` … |
| `contact_purchases` | Histórico de compras do contato (valor, moeda e status) | ativo | `src/components/contacts/ContactPurchaseHistory.tsx`, `src/components/inbox/ContactPurchasesPanel.tsx`, `src/hooks/crm/__tests__/useContactPurchases.criar.test.tsx` … |
| `contacts` | Cadastro central de contatos (telefone, e-mail, dono e campos de CRM) | ativo | `src/App.tsx`, `src/__tests__/a11y/icon-buttons-baseline.json`, `src/__tests__/coverage-catalogo.test.ts` … |
| `copilot_feedback` | Feedback do vendedor sobre sugestões do copilot (aceitou, editou, descartou; distância de edição) | ativo | `src/hooks/copilot/useCopilotFeedback.ts` |
| `conversation_analyses` | Análises de IA da conversa (resumo, sentimento, pontos-chave e risco) | ativo | `src/components/dashboard/AIQuickAccess.tsx`, `src/components/dashboard/SentimentTrendChart.tsx`, `src/components/dashboard/__tests__/AIQuickAccess.test.tsx` … |
| `conversation_closures` | Fechamentos de conversa (motivo, desfecho e classificação) | ativo | `src/components/inbox/CRMAutoSync.tsx`, `src/components/inbox/__tests__/CRMAutoSync.fsm.test.tsx`, `src/components/reports/PeriodComparison.tsx` … |
| `conversation_events` | Eventos da conversa (transferência, mudança de estado e autor) | ativo | `src/components/contacts/ContactActivityTimeline.tsx`, `src/components/contacts/__tests__/ContactActivityTimeline.eventos.test.tsx`, `src/components/contacts/__tests__/ContactActivityTimeline.nota.test.tsx` … |
| `conversation_memory` | Memória da conversa para a IA (fatos, objeções e promessas) | ativo | `src/components/inbox/contact-details/ConversationMemorySection.tsx`, `src/components/inbox/contact-details/__tests__/ConversationMemorySection.test.tsx`, `src/hooks/chat/__tests__/useNextBestAction.test.tsx` … |
| `conversation_sla` | Marcos de SLA por conversa (primeira mensagem, primeira resposta, resolução) | ativo | `src/adapters/inboxAdapter.ts`, `src/components/admin/CrisisRoom.tsx`, `src/components/admin/__tests__/CrisisRoom.canais.test.tsx` … |
| `conversation_snoozes` | Adiamentos de conversa (até quando e por quem) | ativo | `src/components/inbox/chat/useChatPanelHandlers.ts`, `src/hooks/chat/__tests__/useConversationActions.snooze.test.ts`, `src/hooks/chat/__tests__/useConversationActions.test.ts` … |
| `conversation_tasks` | Tarefas ligadas à conversa (título, responsável e prazo) | ativo | `src/components/inbox/tabs/Crm360Tab.tsx`, `src/hooks/chat/__tests__/useConversationHistoryTimeline.janela.test.tsx`, `src/hooks/chat/__tests__/useConversationHistoryTimeline.test.ts` … |
| `crisis_room_alerts` | Alertas de sala de crise (severidade, métrica, valor e limite) | roadmap | — |
| `crm_contact_links` | Vínculo entre o contato do Zapp e contato/empresa do CRM externo | ativo | `src/components/inbox/__tests__/GlobalSearch.r2-inb-020.test.tsx`, `src/components/inbox/contact-details/sidebar/ContactSidebarSections.tsx`, `src/components/inbox/useGlobalSearchData.ts` … |
| `crm_sync_outbox` | Fila de saída da sincronização com o CRM (payload e idempotência) | ativo | `supabase/functions/crm-integration/index.ts`, `.github/workflows/crm-sync-worker.yml`, `.github/workflows/db-migrate.yml` … |
| `csat_auto_config` | Disparo automático de CSAT (tempo de espera e modelo de mensagem) | ativo | `src/components/settings/CSATAutoConfig.tsx`, `src/components/settings/__tests__/CSATAutoConfig.test.tsx` |
| `csat_surveys` | Respostas de pesquisa CSAT (nota, comentário e agente avaliado) | ativo | `src/hooks/business/useCSAT.ts`, `src/hooks/integrations/useCatalogContactSearch.ts`, `src/services/contact.service.ts` |
| `custom_emojis` | Emojis personalizados disponíveis no chat | ativo | `src/components/settings/MediaLibraryAdmin.tsx`, `src/components/settings/__tests__/MediaLibraryAdmin.resolucao.test.tsx`, `src/components/settings/__tests__/MediaLibraryAdmin.test.tsx` … |
| `deal_activities` | Atividades registradas em uma negociação do CRM | ativo | `src/hooks/chat/__tests__/useConversationHistoryTimeline.paginacao.test.tsx`, `src/hooks/chat/useConversationHistoryTimeline.ts`, `src/hooks/crm/useContactCrm360.ts` … |
| `department_audit_logs` | Auditoria de alterações em departamento do chat interno | ativo | `src/hooks/team-chat/README.md`, `src/hooks/team-chat/useDepartmentManagement.ts`, `scripts/db-audit/department-invite-contract-audit-vocabulary.test.sh` … |
| `department_invitations` | Convites de departamento (código, e-mail, papel e validade) | parcial | `scripts/db-audit/department-invite-contract-audit-vocabulary.test.sh`, `scripts/db-audit/migration-evidence.json` |
| `department_invites` | Convites de departamento por código, com validade | ativo | `src/hooks/team-chat/README.md`, `src/hooks/team-chat/__tests__/departmentInviteCode.random.test.tsx`, `src/hooks/team-chat/__tests__/rls-contract.test.ts` … |
| `departments` | Departamentos do chat interno e o modo de WhatsApp de cada um | ativo | `src/components/dashboard/SentimentTrendChart.tsx`, `src/components/talkx/TalkXAnalytics.tsx`, `src/components/team-chat/NewConversationDialog.tsx` … |
| `edge_rate_limits` | Contador de requisições por chave nas Edge Functions, em janela | ativo | `supabase/functions/_shared/ai-circuit.test.ts`, `supabase/functions/_shared/ai-circuit.ts`, `supabase/functions/_shared/ai-generate.ts` … |
| `email_attachmen