# Importadores Estáticos de framer-motion no Caminho Inicial

Gerado em: 2026-10-09

## Comandos de grep utilizados

```bash
grep -rn "from 'framer-motion'" src/components/ --include="*.tsx" --include="*.ts" | grep -v "__tests__" | grep -v "\.test\." | grep -v "\.spec\." | grep -v "vi\.mock" | grep -v "import type" | grep -v "export.*from 'framer-motion'"
grep -rn 'from "framer-motion"' src/components/ --include="*.tsx" --include="*.ts" | grep -v "__tests__" | grep -v "\.test\." | grep -v "\.spec\." | grep -v "vi\.mock" | grep -v "import type" | grep -v "export.*from"
grep -rn "import type.*framer-motion" src/components/ --include="*.tsx" --include="*.ts" | grep -v "__tests__"
grep -rn "export.*from 'framer-motion'" src/components/ --include="*.tsx" --include="*.ts" | grep -v "__tests__" | grep -v "\.test\." | grep -v "\.spec\."
```

## Resumo

| Categoria | Quantidade |
|-----------|-----------|
| Importações runtime (aspas simples) | 326 |
| Importações runtime (aspas duplas) | 3 |
| Importações type-only | 1 |
| Re-exports | 1 |
| **Total de importadores** | **331** |

## Veredito sobre o caminho inicial

- **skip-link.tsx:2** — importa `motion` e `AnimatePresence` em runtime; `App.tsx` importa `SkipLinks` de `@/components/ui/skip-link` de forma não-lazy → **em runtime no caminho inicial**.
- **transitionVariants.ts:1** — usa `import type { Variants, Variant }` → **só tipo**, não carrega framer-motion em runtime.

## Lista completa de importadores

### src/components/ui/ (inicial — compartilhados, importados eager nos layouts)

| Arquivo | Linha | Classificação |
|---------|-------|---------------|
| ui/EmptyState.tsx | 3 | inicial |
| ui/GenericEmptyState.tsx | 15 | inicial |
| ui/SkeletonList.tsx | 3 | inicial |
| ui/accessible-toast.tsx | 3 | inicial |
| ui/command-palette.tsx | 2 | inicial |
| ui/emoji-picker.tsx | 2 | inicial |
| ui/empty-state-illustrations.tsx | 1 | inicial |
| ui/empty-state.tsx | 1 | inicial |
| ui/empty-states.tsx | 2 | inicial |
| ui/empty-states/ContextualEmptyState.tsx | 2 | inicial |
| ui/icon-button.tsx | 4 | inicial |
| ui/liquid-metal-button.tsx | 4 | inicial |
| ui/micro-interactions/buttons.tsx | 3 | inicial |
| ui/micro-interactions/feedback.tsx | 3 | inicial |
| ui/micro-interactions/skeletons.tsx | 3 | inicial |
| ui/mobile-components.tsx | 2 | inicial |
| ui/motion/components.tsx | 1 | inicial |
| ui/motion/effects.tsx | 1 | inicial |
| ui/motion/variants.ts | 1 | inicial |
| ui/offline-indicator.tsx | 2 | inicial |
| ui/quick-peek.tsx | 2 | inicial |
| ui/route-loading-bar.tsx | 2 | inicial |
| ui/scroll-to-top.tsx | 2 | inicial |
| ui/skip-link.tsx | 2 | inicial |
| ui/sparkline.tsx | 1 | inicial |
| ui/step-progress.tsx | 3 | inicial |
| ui/avatar.tsx | 4 | inicial |
| ui/button.tsx | 4 | inicial |
| ui/card.tsx | 2 | inicial |
| ui/motion.tsx | 22 | inicial |

### src/components/transitions/ (inicial — PageTransitionProvider é não-lazy)

| Arquivo | Linha | Classificação |
|---------|-------|---------------|
| transitions/RouteTransition.tsx | 2 | inicial |
| transitions/transitionVariants.ts | 1 | inicial |

### src/components/errors/ (inicial — ErrorBoundary é não-lazy)

| Arquivo | Linha | Classificação |
|---------|-------|---------------|

### src/components/auth/ (não-inicial — importados por páginas lazy)

| Arquivo | Linha | Classificação |
|---------|-------|---------------|
| auth/HeroBenefits.tsx | 1 | nao-inicial |
| auth/PasswordStrengthMeter.tsx | 2 | nao-inicial |
| auth/ReauthDialog.tsx | 2 | nao-inicial |
| auth/SocialProof.tsx | 1 | nao-inicial |

### Demais arquivos (não-inicial — importados por rotas lazy/dynamic)

| Arquivo | Linha | Classificação |
|---------|-------|---------------|
| BulkActionsBar.tsx | 7 | nao-inicial |
| a11y/a11yComponents.tsx | 2 | nao-inicial |
| admin/CrisisRoom.tsx | 7 | nao-inicial |
| admin/PlaybooksManager.tsx | 24 | nao-inicial |
| admin/SupervisorCopilot.tsx | 8 | nao-inicial |
| admin/TrainingMode.tsx | 11 | nao-inicial |
| admin/VisibilityGrantsManager.tsx | 9 | nao-inicial |
| ai/AutoTicketClassifier.tsx | 2 | nao-inicial |
| ai/ChurnPredictionDashboard.tsx | 2 | nao-inicial |
| alerts/EvolutionDisconnectBanner.tsx | 3 | nao-inicial |
| auth/HeroBenefits.tsx | 1 | nao-inicial |
| auth/PasswordStrengthMeter.tsx | 2 | nao-inicial |
| auth/ReauthDialog.tsx | 2 | nao-inicial |
| auth/SocialProof.tsx | 1 | nao-inicial |
| automations/AutomationCard.tsx | 6 | nao-inicial |
| automations/AutomationsManager.tsx | 7 | nao-inicial |
| calls/ActiveCallPanel.tsx | 2 | nao-inicial |
| calls/CallDialog.tsx | 2 | nao-inicial |
| calls/DialPad.tsx | 2 | nao-inicial |
| calls/IncomingCallAlert.tsx | 2 | nao-inicial |
| calls/Keypad.tsx | 2 | nao-inicial |
| calls/TelefoniaView.tsx | 3 | nao-inicial |
| campaigns/CampaignABTesting.tsx | 11 | nao-inicial |
| campaigns/CampaignsView.tsx | 22 | nao-inicial |
| catalog/ExternalProductCatalog.tsx | 22 | nao-inicial |
| catalog/ExternalProductManagement.tsx | 37 | nao-inicial |
| catalog/WhatsAppTemplatesManager.tsx | 11 | nao-inicial |
| catalog/catalogShared.tsx | 298 | nao-inicial |
| chatbot/ChatbotFlowEditor.tsx | 8 | nao-inicial |
| chatbot/ChatbotFlowsView.tsx | 23 | nao-inicial |
| cognitive/FeatureSpotlight.tsx | 2 | nao-inicial |
| cognitive/ProgressiveDisclosure.tsx | 2 | nao-inicial |
| compliance/LGPDComplianceView.tsx | 5 | nao-inicial |
| connections/BusinessHoursDialog.tsx | 2 | nao-inicial |
| connections/BusinessHoursIndicator.tsx | 2 | nao-inicial |
| connections/ConnectionCard.tsx | 17 | nao-inicial |
| connections/NumberReputationMonitor.tsx | 8 | nao-inicial |
| contacts/AdvancedCRMSearch.tsx | 10 | nao-inicial |
| contacts/BulkActionsBar.tsx | 2 | nao-inicial |
| contacts/CRMContactCard.tsx | 1 | nao-inicial |
| contacts/ContactActivityTimeline.tsx | 2 | nao-inicial |
| contacts/ContactAdvancedFilters.tsx | 1 | nao-inicial |
| contacts/ContactAnalyticsDashboard.tsx | 2 | nao-inicial |
| contacts/ContactBulkTagDialog.tsx | 2 | nao-inicial |
| contacts/ContactCompareDialog.tsx | 1 | nao-inicial |
| contacts/ContactContentArea.tsx | 2 | nao-inicial |
| contacts/ContactDetailPanel.tsx | 2 | nao-inicial |
| contacts/ContactDialogs.tsx | 2 | nao-inicial |
| contacts/ContactEmptyState.tsx | 1 | nao-inicial |
| contacts/ContactEngagementScore.tsx | 2 | nao-inicial |
| contacts/ContactForm.tsx | 8 | nao-inicial |
| contacts/ContactGroupedList.tsx | 2 | nao-inicial |
| contacts/ContactKanbanView.tsx | 2 | nao-inicial |
| contacts/ContactKpiCard.tsx | 2 | nao-inicial |
| contacts/ContactMapView.tsx | 2 | nao-inicial |
| contacts/ContactNotes.tsx | 2 | nao-inicial |
| contacts/ContactPurchaseHistory.tsx | 2 | nao-inicial |
| contacts/ContactSearchWithSuggestions.tsx | 2 | nao-inicial |
| contacts/ContactTypeTabs.tsx | 2 | nao-inicial |
| contacts/ContactViewSwitcher.tsx | 2 | nao-inicial |
| contacts/ContactsSkeleton.tsx | 1 | nao-inicial |
| contacts/ContactsTable.tsx | 2 | nao-inicial |
| contacts/ContactsView.tsx | 2 | nao-inicial |
| contacts/FilterPresets.tsx | 2 | nao-inicial |
| csat/CSATDashboard.tsx | 8 | nao-inicial |
| dashboard/ActivityHeatmap.tsx | 2 | nao-inicial |
| dashboard/ConversationHeatmap.tsx | 26 | nao-inicial |
| dashboard/DashboardFilters.tsx | 2 | nao-inicial |
| dashboard/DashboardSectionHeader.tsx | 1 | nao-inicial |
| dashboard/DemandPrediction.tsx | 2 | nao-inicial |
| dashboard/DraggableWidgetContainer.tsx | 2 | nao-inicial |
| dashboard/FloatingParticles.tsx | 25 | nao-inicial |
| dashboard/GamificationEffects.tsx | 2 | nao-inicial |
| dashboard/MetricComparison.tsx | 24 | nao-inicial |
| dashboard/ProgressiveDisclosureDashboard.tsx | 2 | nao-inicial |
| dashboard/SatisfactionAgentRanking.tsx | 1 | nao-inicial |
| dashboard/SentimentAlertsDashboard.tsx | 2 | nao-inicial |
| dashboard/SentimentHelpers.tsx | 7 | nao-inicial |
| dashboard/SentimentTabContent.tsx | 1 | nao-inicial |
| dashboard/TrendIndicator.tsx | 18 | nao-inicial |
| dashboard/WarRoomDashboard.tsx | 2 | nao-inicial |
| dashboard/WidgetConfigSheet.tsx | 2 | nao-inicial |
| dashboard/goals/GoalsRail.tsx | 2 | nao-inicial |
| dashboard/goals/GoalsTable.tsx | 2 | nao-inicial |
| dashboard/metrics/AnimatedMetricCard.tsx | 2 | nao-inicial |
| dashboard/metrics/GoalProgressRing.tsx | 2 | nao-inicial |
| dashboard/metrics/MiniSparkline.tsx | 2 | nao-inicial |
| dashboard/metrics/TrendIndicator.tsx | 2 | nao-inicial |
| dashboard/overview/CsatCard.tsx | 2 | nao-inicial |
| dashboard/overview/DailyGoalsCard.tsx | 3 | nao-inicial |
| dashboard/overview/DashboardCard.tsx | 4 | nao-inicial |
| dashboard/overview/DashboardKpiCard.tsx | 5 | nao-inicial |
| dashboard/overview/DashboardTabs.tsx | 1 | nao-inicial |
| dashboard/overview/GreetingBanner.tsx | 2 | nao-inicial |
| dashboard/overview/TeamHighlightCard.tsx | 2 | nao-inicial |
| dashboard/war-room/WarRoomAgentCard.tsx | 1 | nao-inicial |
| dashboard/war-room/WarRoomAlertRow.tsx | 1 | nao-inicial |
| dashboard/war-room/WarRoomMetricCard.tsx | 1 | nao-inicial |
| dashboard/war-room/WarRoomQueueRow.tsx | 1 | nao-inicial |
| diagnostics/ConnectionHealthPanel.tsx | 12 | nao-inicial |
| diagnostics/DiagnosticsView.tsx | 9 | nao-inicial |
| docs/SystemFeaturesView.tsx | 2 | nao-inicial |
| effects/AuroraBorealis.tsx | 1 | nao-inicial |
| effects/Confetti.tsx | 2 | nao-inicial |
| effects/EasterEggs.tsx | 2 | nao-inicial |
| effects/ParallaxContainer.tsx | 1 | nao-inicial |
| effects/ScrollEffects.tsx | 1 | nao-inicial |
| email/EmailChatBubble.tsx | 2 | nao-inicial |
| email/EmailChatInbox.tsx | 2 | nao-inicial |
| email/EmailThreadList.tsx | 2 | nao-inicial |
| gamification/AchievementBadge.tsx | 1 | nao-inicial |
| gamification/AchievementToast.tsx | 1 | nao-inicial |
| gamification/AchievementsPanel.tsx | 2 | nao-inicial |
| gamification/AchievementsStats.tsx | 2 | nao-inicial |
| gamification/AchievementsSystem.tsx | 2 | nao-inicial |
| gamification/DemoAchievements.tsx | 1 | nao-inicial |
| gamification/TrainingMiniGames.tsx | 2 | nao-inicial |
| gmail/EmailComposer.tsx | 3 | nao-inicial |
| gmail/EmailThreadView.tsx | 4 | nao-inicial |
| gmail/GmailInboxView.tsx | 2 | nao-inicial |
| gmail/ThreadListItem.tsx | 1 | nao-inicial |
| groups/GroupsView.tsx | 2 | nao-inicial |
| inbox/AIConversationAssistant.tsx | 2 | nao-inicial |
| inbox/AISuggestions.tsx | 2 | nao-inicial |
| inbox/AudioMemePicker.tsx | 8 | nao-inicial |
| inbox/AudioMessagePlayer.tsx | 2 | nao-inicial |
| inbox/AudioRecorder.tsx | 2 | nao-inicial |
| inbox/BulkActionsToolbar.tsx | 6 | nao-inicial |
| inbox/ContactDetails.tsx | 8 | nao-inicial |
| inbox/ContactPurchasesPanel.tsx | 15 | nao-inicial |
| inbox/ConversationListSidebar.tsx | 2 | nao-inicial |
| inbox/ConversationSummary.tsx | 2 | nao-inicial |
| inbox/CustomEmojiPicker.tsx | 8 | nao-inicial |
| inbox/ForwardMessageDialog.tsx | 2 | nao-inicial |
| inbox/ImagePreview.tsx | 3 | nao-inicial |
| inbox/InboxEmptyChat.tsx | 1 | nao-inicial |
| inbox/InteractiveMessage.tsx | 2 | nao-inicial |
| inbox/InteractiveMessageBuilder.tsx | 2 | nao-inicial |
| inbox/LinkPreview.tsx | 2 | nao-inicial |
| inbox/LocationMessage.tsx | 2 | nao-inicial |
| inbox/LocationPicker.tsx | 2 | nao-inicial |
| inbox/MediaPreview.tsx | 2 | nao-inicial |
| inbox/MessagePreview.tsx | 2 | nao-inicial |
| inbox/MessageReactions.tsx | 2 | nao-inicial |
| inbox/MessageTemplates.tsx | 2 | nao-inicial |
| inbox/NewConversationModal.tsx | 12 | nao-inicial |
| inbox/NewMessageIndicator.tsx | 1 | nao-inicial |
| inbox/NextBestActionEngine.tsx | 3 | nao-inicial |
| inbox/ObjectionDetector.tsx | 6 | nao-inicial |
| inbox/QuickRepliesManager.tsx | 2 | nao-inicial |
| inbox/RealtimeTranscription.tsx | 3 | nao-inicial |
| inbox/ReplyQuote.tsx | 1 | nao-inicial |
| inbox/SLAIndicator.tsx | 3 | nao-inicial |
| inbox/ScheduleMessageDialog.tsx | 2 | nao-inicial |
| inbox/SentimentIndicator.tsx | 2 | nao-inicial |
| inbox/SlashCommands.tsx | 2 | nao-inicial |
| inbox/StickerPicker.tsx | 6 | nao-inicial |
| inbox/SwipeableListItem.tsx | 2 | nao-inicial |
| inbox/TemplatesWithVariables.tsx | 10 | nao-inicial |
| inbox/TextToAudioButton.tsx | 4 | nao-inicial |
| inbox/TransferDialog.tsx | 3 | nao-inicial |
| inbox/TypingIndicator.tsx | 1 | nao-inicial |
| inbox/UniversityHelp.tsx | 6 | nao-inicial |
| inbox/VideoFullscreen.tsx | 3 | nao-inicial |
| inbox/VoiceChanger.tsx | 4 | nao-inicial |
| inbox/VoiceChangerPicker.tsx | 6 | nao-inicial |
| inbox/WhisperMode.tsx | 5 | nao-inicial |
| inbox/ai-tools/AIResponseCard.tsx | 4 | nao-inicial |
| inbox/ai-tools/AnalysisTabs.tsx | 1 | nao-inicial |
| inbox/ai-tools/HistoryTab.tsx | 1 | nao-inicial |
| inbox/ai-tools/KeyPointsTab.tsx | 1 | nao-inicial |
| inbox/ai-tools/SummaryTab.tsx | 2 | nao-inicial |
| inbox/ai-tools/ToolPanel.tsx | 2 | nao-inicial |
| inbox/chat/ChatInputArea.tsx | 7 | nao-inicial |
| inbox/chat/ChatSearchBar.tsx | 6 | nao-inicial |
| inbox/chat/ChatSearchResultsList.tsx | 2 | nao-inicial |
| inbox/chat/ConversationTabs.tsx | 1 | nao-inicial |
| inbox/chat/InputPreviewBars.tsx | 1 | nao-inicial |
| inbox/chat/MentionAutocomplete.tsx | 2 | nao-inicial |
| inbox/chat/PinnedConversationsStack.tsx | 2 | nao-inicial |
| inbox/chat/RichTextToolbar.tsx | 6 | nao-inicial |
| inbox/collaboration/InternalNotesPanel.tsx | 11 | nao-inicial |
| inbox/collaboration/MentionInput.tsx | 9 | nao-inicial |
| inbox/contact-details/CompactContactHeader.tsx | 3 | nao-inicial |
| inbox/contact-details/Contact360Helpers.tsx | 7 | nao-inicial |
| inbox/contact-details/ContactHeaderSection.tsx | 7 | nao-inicial |
| inbox/contact-details/ContactIntelligencePanel.tsx | 13 | nao-inicial |
| inbox/contact-details/ExternalContact360Panel.tsx | 8 | nao-inicial |
| inbox/contact-details/sidebar/SidebarSection.tsx | 2 | nao-inicial |
| inbox/quick-replies/QuickReplyCardList.tsx | 1 | nao-inicial |
| inbox/quick-replies/QuickReplyDialog.tsx | 2 | nao-inicial |
| inbox/search/GlobalSearchFilters.tsx | 2 | nao-inicial |
| inbox/search/GlobalSearchResults.tsx | 2 | nao-inicial |
| inbox/stickers/PersonalStickers.tsx | 11 | nao-inicial |
| inbox/stickers/StickerGrid.tsx | 3 | nao-inicial |
| inbox/stickers/StickerManager.tsx | 18 | nao-inicial |
| inbox/stickers/StickerUploadPreview.tsx | 4 | nao-inicial |
| inbox/summary/SummaryResult.tsx | 1 | nao-inicial |
| inbox/tabs/ContactStatsStrip.tsx | 4 | nao-inicial |
| integrations/GoogleCalendarIntegration.tsx | 2 | nao-inicial |
| integrations/IntegrationsHub.tsx | 2 | nao-inicial |
| integrations/N8nIntegrationView.tsx | 2 | nao-inicial |
| integrations/SentryIntegrationView.tsx | 2 | nao-inicial |
| keyboard/KeyboardShortcutsDialog.tsx | 1 | nao-inicial |
| knowledge/KnowledgeBaseView.tsx | 2 | nao-inicial |
| layout/PageTemplate.tsx | 3 | nao-inicial |
| layout/SidebarNavGroup.tsx | 4 | nao-inicial |
| leaderboard/Leaderboard.tsx | 1 | nao-inicial |
| leaderboard/LeaderboardHelpers.tsx | 2 | nao-inicial |
| mfa/MFABackupCodes.tsx | 3 | nao-inicial |
| mfa/MFAEnroll.tsx | 2 | nao-inicial |
| mfa/MFASettings.tsx | 2 | nao-inicial |
| mfa/MFAVerify.tsx | 2 | nao-inicial |
| mobile/BottomSheet.tsx | 2 | nao-inicial |
| mobile/FloatingActionButtons.tsx | 2 | nao-inicial |
| mobile/InAppNotification.tsx | 1 | nao-inicial |
| mobile/MiniChatPiP.tsx | 2 | nao-inicial |
| mobile/MobileDrawerMenu.tsx | 2 | nao-inicial |
| mobile/MobileFAB.tsx | 1 | nao-inicial |
| mobile/MobileHeader.tsx | 2 | nao-inicial |
| mobile/MobileNavigation.tsx | 2 | nao-inicial |
| mobile/MobilePullToRefresh.tsx | 2 | nao-inicial |
| mobile/MobileSlidePanel.tsx | 2 | nao-inicial |
| mobile/NotificationsPanel.tsx | 2 | nao-inicial |
| mobile/SwipeGestures.tsx | 2 | nao-inicial |
| mobile/SwipeableMessage.tsx | 2 | nao-inicial |
| mobile/TouchRipple.tsx | 2 | nao-inicial |
| mobile/VoiceDictationButton.tsx | 2 | nao-inicial |
| monitoring/EvolutionMonitoringDashboard.tsx | 5 | nao-inicial |
| monitoring/MonitoringConnectionsList.tsx | 9 | nao-inicial |
| monitoring/MonitoringDiagnosticPanel.tsx | 7 | nao-inicial |
| monitoring/MonitoringEventTimeline.tsx | 10 | nao-inicial |
| monitoring/MonitoringHealthLogs.tsx | 12 | nao-inicial |
| monitoring/MonitoringSLAPanel.tsx | 6 | nao-inicial |
| monitoring/MonitoringStatsCards.tsx | 4 | nao-inicial |
| notifications/NotificationSettingsPanel.tsx | 12 | nao-inicial |
| omnichannel/OmnichannelInbox.tsx | 2 | nao-inicial |
| omnichannel/OmnichannelManager.tsx | 5 | nao-inicial |
| onboarding/OnboardingChecklist.tsx | 2 | nao-inicial |
| onboarding/TourOverlay.tsx | 2 | nao-inicial |
| onboarding/WelcomeModal.tsx | 2 | nao-inicial |
| payments/PaymentLinksView.tsx | 3 | nao-inicial |
| performance/LazyRoutes.tsx | 2 | nao-inicial |
| performance/OptimizedImage.tsx | 2 | nao-inicial |
| performance/VirtualizedList.tsx | 3 | nao-inicial |
| permissions/PermissionMatrix.tsx | 2 | nao-inicial |
| queues/QueueAlertsDisplay.tsx | 1 | nao-inicial |
| queues/SLAAgentTable.tsx | 1 | nao-inicial |
| queues/SLADashboard.tsx | 11 | nao-inicial |
| queues/SLAMetricCards.tsx | 1 | nao-inicial |
| reports/AdvancedReportsView.tsx | 14 | nao-inicial |
| reports/ReportCharts.tsx | 10 | nao-inicial |
| reports/ScheduledReportsManager.tsx | 36 | nao-inicial |
| schedule/ScheduleCalendarView.tsx | 2 | nao-inicial |
| security/AuditLogDashboard.tsx | 2 | nao-inicial |
| security/BlockedIPsPanel.tsx | 2 | nao-inicial |
| security/DeviceCard.tsx | 1 | nao-inicial |
| security/GeoBlockingPanel.tsx | 1 | nao-inicial |
| security/IPWhitelistPanel.tsx | 2 | nao-inicial |
| security/PasskeysPanel.tsx | 9 | nao-inicial |
| security/PasswordResetRequestsPanel.tsx | 2 | nao-inicial |
| security/RateLimitConfigPanel.tsx | 2 | nao-inicial |
| security/RateLimitRealtimeAlerts.tsx | 2 | nao-inicial |
| security/SecurityNotificationsPanel.tsx | 2 | nao-inicial |
| security/SecurityOverview.tsx | 2 | nao-inicial |
| security/SecurityPanels.tsx | 1 | nao-inicial |
| security/SecuritySettingsPanel.tsx | 2 | nao-inicial |
| security/SecurityView.tsx | 2 | nao-inicial |
| settings/AvatarUpload.tsx | 2 | nao-inicial |
| settings/KeyboardShortcutsSettings.tsx | 2 | nao-inicial |
| settings/MediaLibraryAdmin.tsx | 11 | nao-inicial |
| settings/SLAConfigurationManager.tsx | 16 | nao-inicial |
| settings/SLARulesManager.tsx | 7 | nao-inicial |
| settings/SoundCategoryCard.tsx | 1 | nao-inicial |
| settings/SoundCustomizationPanel.tsx | 9 | nao-inicial |
| settings/ThemeCustomizer.tsx | 1 | nao-inicial |
| settings/ai-providers/AIProviderCard.tsx | 12 | nao-inicial |
| settings/ai-providers/AIProviderHealthPanel.tsx | 8 | nao-inicial |
| settings/sla/SLARuleRow.tsx | 7 | nao-inicial |
| settings/sla/ScopeRulesList.tsx | 9 | nao-inicial |
| settings/theme/PresetCard.tsx | 2 | nao-inicial |
| sla/SLACharts.tsx | 1 | nao-inicial |
| sla/SLAHistoryDashboard.tsx | 5 | nao-inicial |
| talkx/TalkXLiveMonitor.tsx | 11 | nao-inicial |
| talkx/kit/kpi.tsx | 2 | nao-inicial |
| tasks/TasksModule.tsx | 2 | nao-inicial |
| tasks/list/TasksListMode.tsx | 2 | nao-inicial |
| tasks/shared/ModeSwitcher.tsx | 2 | nao-inicial |
| team-chat/TeamChatInputArea.tsx | 6 | nao-inicial |
| team-chat/TeamChatPanel.tsx | 9 | nao-inicial |
| team-chat/TeamChatView.tsx | 11 | nao-inicial |
| transcriptions/TranscriptionContactGroup.tsx | 2 | nao-inicial |
| transcriptions/TranscriptionsHistoryView.tsx | 2 | nao-inicial |
| voice/AudioFrequencyVisualizer.tsx | 2 | nao-inicial |
| voice/VoiceOrb.tsx | 1 | nao-inicial |
| voice/VoiceSearchOverlay.tsx | 3 | nao-inicial |
| voice/VoiceSuggestions.tsx | 1 | nao-inicial |
| voice/VoiceTranscriptArea.tsx | 1 | nao-inicial |
| whatsapp-flows/WhatsAppFlowsBuilder.tsx | 5 | nao-inicial |

## Notas importantes

- **transitionVariants.ts:1** — usa `import type { Variants, Variant } from 'framer-motion'`. Importação type-only; não carrega framer-motion em runtime. Classificada como **só tipo**.
- **motion.tsx:22** — re-export: `export { AnimatePresence, motion } from 'framer-motion'`. É um barrel file; qualquer import de `@/components/ui/motion` puxa framer-motion para o bundle.
- **motion/components.tsx, motion/variants.ts, motion/effects.tsx** — submódulos do barrel `motion.tsx`; também carregam framer-motion em runtime.
- **skip-link.tsx:2** — importa `motion` e `AnimatePresence` em runtime; `App.tsx` importa `SkipLinks` de forma não-lazy → **em runtime no caminho inicial**.
