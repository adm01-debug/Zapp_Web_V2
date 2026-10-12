# FEATURE_REGISTRY.md — registro das views do V2

Registro das views roteadas pelo `ViewRouter` (`src/pages/ViewRouter.tsx`): para cada
`view` do mapa, o componente que a renderiza, o arquivo da evidência e a
**classificação** do estado atual. É o par do `ESTADO.md`: lá, quem chama as edges;
aqui, o que cada view entrega hoje.

Base: `dia/2026-10-09`. 56 views (`VIEW_MAP` + `SPECIAL_VIEWS`).

## Classificação

| Estado | Regra (verificada pela guarda) |
|---|---|
| **Full** | a view resolve para um componente real e a busca de dados alcança o banco/edge — evidência é o arquivo que contém `.from(`, `.rpc(` ou `invoke(` (o próprio componente ou um hook/serviço/lib importado por ele) |
| **Partial** | a view resolve para componente real, mas a busca de dados **não** foi comprovada no arquivo do componente nem em um hook/serviço/lib importado por ele (a coluna de evidência aponta o próprio componente) |
| **Suggested** | a view está no mapa/módulos mas o componente não se resolve em `src/pages/lazyViews.ts` — a rota existe e não entrega tela comprovada |

A guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` recalcula as três colunas
a partir do código: componente, arquivo e classificação. View nova, componente trocado
ou rota vazia derrubam o teste até este arquivo ser atualizado.

## Totais

| Estado | Views |
|---|---|
| Full | 43 |
| Partial | 13 |
| Suggested | 0 |
| **total** | **56** |

## Tabela

| View | Componente | Arquivo | Estado | Evidência |
|---|---|---|---|---|
| `inbox` | `RealtimeInboxView` | `src/components/inbox/RealtimeInboxView.tsx` | Full | `src/hooks/inbox/useInboxBulkActions.ts` |
| `dashboard` | `DashboardView` | `src/components/dashboard/DashboardView.tsx` | Full | `src/hooks/analytics/useRealtimeDashboard.ts` |
| `agents` | `AgentsView` | `src/components/agents/AgentsView.tsx` | Full | `src/hooks/crm/useAgents.ts` |
| `queues` | `QueuesView` | `src/components/queues/QueuesView.tsx` | Full | `src/hooks/business/useQueues.ts` |
| `contacts` | `ContactsView` | `src/components/contacts/ContactsView.tsx` | Full | `src/hooks/crm/useCRMAdminAccess.ts` |
| `groups` | `GroupsView` | `src/components/groups/GroupsView.tsx` | Full | `src/components/groups/GroupsView.tsx` |
| `connections` | `ConnectionsView` | `src/components/connections/ConnectionsView.tsx` | Full | `src/components/connections/ConnectionsView.tsx` |
| `wallet` | `ClientWalletView` | `src/components/wallet/ClientWalletView.tsx` | Full | `src/hooks/business/useClientWallet.ts` |
| `catalog` | `ProductManagement` | `src/components/catalog/ExternalProductManagement.tsx` | Full | `src/hooks/integrations/useExternalCatalog.ts` |
| `transcriptions` | `TranscriptionsHistoryView` | `src/components/transcriptions/TranscriptionsHistoryView.tsx` | Full | `src/components/transcriptions/TranscriptionsHistoryView.tsx` |
| `admin` | `AdminView` | `src/components/admin/AdminView.tsx` | Partial | `src/components/admin/AdminView.tsx` |
| `sentiment` | `SentimentAlertsDashboard` | `src/components/dashboard/SentimentAlertsDashboard.tsx` | Partial | `src/components/dashboard/SentimentAlertsDashboard.tsx` |
| `reports` | `AdvancedReportsView` | `src/components/reports/AdvancedReportsView.tsx` | Partial | `src/components/reports/AdvancedReportsView.tsx` |
| `security` | `SecurityView` | `src/components/security/SecurityView.tsx` | Full | `src/hooks/system/useSecurityPushNotifications.ts` |
| `settings` | `SettingsView` | `src/components/settings/SettingsView.tsx` | Full | `src/components/settings/SettingsView.tsx` |
| `docs` | `SystemFeaturesView` | `src/components/docs/SystemFeaturesView.tsx` | Partial | `src/components/docs/SystemFeaturesView.tsx` |
| `campaigns` | `CampaignsView` | `src/components/campaigns/CampaignsView.tsx` | Full | `src/hooks/communication/useCampaigns.ts` |
| `chatbot` | `ChatbotFlowsView` | `src/components/chatbot/ChatbotFlowsView.tsx` | Full | `src/hooks/integrations/useChatbotFlows.ts` |
| `automations` | `AutomationsManager` | `src/components/automations/AutomationsManager.tsx` | Partial | `src/components/automations/AutomationsManager.tsx` |
| `integrations` | `IntegrationsHub` | `src/components/integrations/IntegrationsHub.tsx` | Partial | `src/components/integrations/IntegrationsHub.tsx` |
| `privacy` | `LGPDComplianceView` | `src/components/compliance/LGPDComplianceView.tsx` | Full | `src/components/compliance/LGPDComplianceView.tsx` |
| `tasks` | `TasksModule` | `src/components/tasks/TasksModule.tsx` | Full | `src/components/tasks/TasksModule.tsx` |
| `knowledge` | `KnowledgeBaseView` | `src/components/knowledge/KnowledgeBaseView.tsx` | Full | `src/hooks/integrations/useKnowledgeBase.ts` |
| `payments` | `PaymentLinksView` | `src/components/payments/PaymentLinksView.tsx` | Full | `src/hooks/payments/usePaymentLinks.ts` |
| `wa-flows` | `WhatsAppFlowsBuilder` | `src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` | Full | `src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx` |
| `meta-capi` | `MetaCAPIView` | `src/components/meta-capi/MetaCAPIView.tsx` | Full | `src/hooks/integrations/useMetaCAPIData.ts` |
| `diagnostics` | `DiagnosticsView` | `src/components/diagnostics/DiagnosticsView.tsx` | Full | `src/hooks/system/useDiagnosticsData.ts` |
| `voip` | `TelefoniaView` | `src/components/calls/TelefoniaView.tsx` | Full | `src/hooks/communication/useCalls.ts` |
| `auto-export` | `AutoExportManager` | `src/components/reports/AutoExportManager.tsx` | Partial | `src/components/reports/AutoExportManager.tsx` |
| `google-calendar` | `GoogleCalendarIntegration` | `src/components/integrations/GoogleCalendarIntegration.tsx` | Partial | `src/components/integrations/GoogleCalendarIntegration.tsx` |
| `themes` | `ThemeCustomizer` | `src/components/settings/ThemeCustomizer.tsx` | Partial | `src/components/settings/ThemeCustomizer.tsx` |
| `schedule` | `ScheduleCalendarView` | `src/components/schedule/ScheduleCalendarView.tsx` | Full | `src/components/schedule/ScheduleCalendarView.tsx` |
| `warroom` | `WarRoomDashboard` | `src/components/dashboard/WarRoomDashboard.tsx` | Full | `src/hooks/business/useWarRoomAlerts.ts` |
| `wa-templates` | `WhatsAppTemplatesManager` | `src/components/catalog/WhatsAppTemplatesManager.tsx` | Full | `src/hooks/integrations/useWhatsAppTemplates.ts` |
| `omnichannel` | `OmnichannelManager` | `src/components/omnichannel/OmnichannelManager.tsx` | Full | `src/components/omnichannel/OmnichannelManager.tsx` |
| `churn` | `ChurnPredictionDashboard` | `src/components/ai/ChurnPredictionDashboard.tsx` | Full | `src/components/ai/ChurnPredictionDashboard.tsx` |
| `ticket-classifier` | `AutoTicketClassifier` | `src/components/ai/AutoTicketClassifier.tsx` | Full | `src/components/ai/AutoTicketClassifier.tsx` |
| `performance` | `PerformanceMonitor` | `src/components/performance/PerformanceMonitor.tsx` | Full | `src/hooks/analytics/usePerformanceSnapshots.ts` |
| `omni-inbox` | `OmnichannelInbox` | `src/components/omnichannel/OmnichannelInbox.tsx` | Full | `src/components/omnichannel/OmnichannelInbox.tsx` |
| `audit-logs` | `AuditLogDashboard` | `src/components/security/AuditLogDashboard.tsx` | Full | `src/components/security/AuditLogDashboard.tsx` |
| `telemetry` | `AdminTelemetriaPage` | `src/pages/AdminTelemetriaPage.tsx` | Full | `src/pages/AdminTelemetriaPage.tsx` |
| `nps` | `NPSDashboard` | `src/components/nps/NPSDashboard.tsx` | Full | `src/hooks/business/useNPSSurveys.ts` |
| `team-chat` | `TeamChatView` | `src/components/team-chat/TeamChatView.tsx` | Full | `src/hooks/chat/useTeamChatNotifications.ts` |
| `email-chat` | `EmailChatView` | `src/components/email/EmailChatInbox.tsx` | Full | `src/hooks/integrations/useGmail.ts` |
| `gmail` | `GmailInboxView` | `src/components/gmail/GmailInboxView.tsx` | Full | `src/hooks/integrations/useGmail.ts` |
| `public-api` | `PublicApiDashboard` | `src/components/admin/PublicApiDashboard.tsx` | Partial | `src/components/admin/PublicApiDashboard.tsx` |
| `gmail-webhook` | `GmailWebhookMonitor` | `src/components/admin/GmailWebhookMonitor.tsx` | Full | `src/components/admin/GmailWebhookMonitor.tsx` |
| `media-migration` | `MediaMigrationTool` | `src/components/admin/MediaMigrationTool.tsx` | Full | `src/components/admin/MediaMigrationTool.tsx` |
| `crm360` | `CRM360ExplorerView` | `src/components/crm360/CRM360ExplorerView.tsx` | Partial | `src/components/crm360/CRM360ExplorerView.tsx` |
| `ai-usage` | `AIUsageDashboard` | `src/components/admin/AIUsageDashboard.tsx` | Full | `src/hooks/analytics/useAIUsageDashboard.ts` |
| `sla` | `SLADashboardView` | `src/components/queues/SLADashboard.tsx` | Full | `src/hooks/sla/useSLAMetrics.ts` |
| `talkx` | `TalkXView` | `src/components/talkx/TalkXView.tsx` | Full | `src/hooks/integrations/useTalkX.ts` |
| `talkx-kit` | `TalkXKitView` | `src/components/talkx/__dev__/TalkXKit.tsx` | Partial | `src/components/talkx/__dev__/TalkXKit.tsx` |
| `multiplix` | `MultiplixView` | `src/components/multiplix/MultiplixView.tsx` | Full | `src/components/multiplix/MultiplixView.tsx` |
| `evolution-monitor` | `EvolutionMonitoringDashboard` | `src/components/monitoring/EvolutionMonitoringDashboard.tsx` | Partial | `src/components/monitoring/EvolutionMonitoringDashboard.tsx` |
| `achievements` | `AchievementsSystemLazy` | `src/components/gamification/AchievementsSystem.tsx` | Full | `src/hooks/gamification/useAgentGamification.ts` |
