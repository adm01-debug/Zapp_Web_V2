# Importadores Estáticos de framer-motion — Caminho Inicial

**Gerado em**: 2026-10-09
**Total de importadores**: 306 inicial + 24 não-inicial + 1 tipo + 1 re-export = 332 linhas

---

## Comandos de grep utilizados

```bash
rg "from 'framer-motion'" src/components/ --no-config
rg 'from "framer-motion"' src/components/ --no-config
rg "require('framer-motion')" src/components/ --no-config
```

Nenhum `require('framer-motion')` encontrado em `src/components/`.

---

## Veredicto

- **skip-link.tsx:2** — em runtime no caminho inicial (componente do layout, carregado no bundle inicial)
- **transitionVariants.ts:1** — só tipo (`import type { Variants, Variant } from 'framer-motion'`), não adiciona código ao bundle

---

## Importadores Iniciais (bundle inicial) — 306

- `src/components/BulkActionsBar.tsx:7` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/a11y/a11yComponents.tsx:2` — import { motion } from 'framer-motion';
- `src/components/admin/CrisisRoom.tsx:8` — import { motion } from 'framer-motion';
- `src/components/admin/PlaybooksManager.tsx:24` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/admin/SupervisorCopilot.tsx:8` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/admin/TrainingMode.tsx:10` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/admin/VisibilityGrantsManager.tsx:9` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ai/AutoTicketClassifier.tsx:2` — import { motion } from 'framer-motion';
- `src/components/ai/ChurnPredictionDashboard.tsx:2` — import { motion } from 'framer-motion';
- `src/components/auth/HeroBenefits.tsx:1` — import { motion } from 'framer-motion';
- `src/components/auth/PasswordStrengthMeter.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/auth/ReauthDialog.tsx:2` — import { motion } from 'framer-motion';
- `src/components/auth/SocialProof.tsx:1` — import { motion } from 'framer-motion';
- `src/components/automations/AutomationCard.tsx:6` — import { motion } from 'framer-motion';
- `src/components/automations/AutomationsManager.tsx:7` — import { AnimatePresence } from 'framer-motion';
- `src/components/calls/ActiveCallPanel.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/calls/CallDialog.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/calls/DialPad.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/calls/IncomingCallAlert.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/calls/Keypad.tsx:2` — import { motion } from 'framer-motion';
- `src/components/calls/TelefoniaView.tsx:3` — import { motion } from 'framer-motion';
- `src/components/campaigns/CampaignsView.tsx:22` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/catalog/ExternalProductCatalog.tsx:22` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/catalog/ExternalProductManagement.tsx:37` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/catalog/WhatsAppTemplatesManager.tsx:11` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/catalog/catalogShared.tsx:338` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/chatbot/ChatbotFlowEditor.tsx:12` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/chatbot/ChatbotFlowsView.tsx:23` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/cognitive/FeatureSpotlight.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/cognitive/ProgressiveDisclosure.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/compliance/LGPDComplianceView.tsx:5` — import { motion } from 'framer-motion';
- `src/components/connections/BusinessHoursDialog.tsx:2` — import { motion } from 'framer-motion';
- `src/components/connections/BusinessHoursIndicator.tsx:2` — import { motion } from 'framer-motion';
- `src/components/connections/ConnectionCard.tsx:17` — import { motion } from 'framer-motion';
- `src/components/connections/NumberReputationMonitor.tsx:9` — import { motion } from 'framer-motion';
- `src/components/contacts/AdvancedCRMSearch.tsx:10` — import { AnimatePresence } from 'framer-motion';
- `src/components/contacts/BulkActionsBar.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/CRMContactCard.tsx:1` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactActivityTimeline.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactAdvancedFilters.tsx:1` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactAnalyticsDashboard.tsx:2` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactBulkTagDialog.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactCompareDialog.tsx:1` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactContentArea.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactDetailPanel.tsx:3` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactDialogs.tsx:2` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactEmptyState.tsx:1` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactEngagementScore.tsx:2` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactForm.tsx:8` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactGroupedList.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactKanbanView.tsx:2` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactKpiCard.tsx:2` — import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
- `src/components/contacts/ContactMapView.tsx:2` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactNotes.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactPurchaseHistory.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactSearchWithSuggestions.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/contacts/ContactTypeTabs.tsx:2` — import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
- `src/components/contacts/ContactViewSwitcher.tsx:2` — import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
- `src/components/contacts/ContactsSkeleton.tsx:1` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactsTable.tsx:2` — import { motion } from 'framer-motion';
- `src/components/contacts/FilterPresets.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/csat/CSATDashboard.tsx:8` — import { motion } from 'framer-motion';
- `src/components/dashboard/ActivityHeatmap.tsx:2` — import { motion } from 'framer-motion';
- `src/components/dashboard/ConversationHeatmap.tsx:26` — import { motion } from 'framer-motion';
- `src/components/dashboard/DashboardFilters.tsx:2` — import { motion } from 'framer-motion';
- `src/components/dashboard/DashboardSectionHeader.tsx:1` — import { motion } from 'framer-motion';
- `src/components/dashboard/DemandPrediction.tsx:2` — import { motion } from 'framer-motion';
- `src/components/dashboard/DraggableWidgetContainer.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/dashboard/FloatingParticles.tsx:25` — import { motion } from 'framer-motion';
- `src/components/dashboard/GamificationEffects.tsx:2` — import { motion } from 'framer-motion';
- `src/components/dashboard/MetricComparison.tsx:24` — import { motion } from 'framer-motion';
- `src/components/dashboard/ProgressiveDisclosureDashboard.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/dashboard/SatisfactionAgentRanking.tsx:1` — import { motion } from 'framer-motion';
- `src/components/dashboard/SentimentHelpers.tsx:7` — import { motion } from 'framer-motion';
- `src/components/dashboard/SentimentTabContent.tsx:1` — import { motion } from 'framer-motion';
- `src/components/dashboard/TrendIndicator.tsx:18` — import { motion } from 'framer-motion';
- `src/components/dashboard/WarRoomDashboard.tsx:2` — import { AnimatePresence } from 'framer-motion';
- `src/components/dashboard/WidgetConfigSheet.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/dashboard/goals/GoalsRail.tsx:2` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/goals/GoalsTable.tsx:2` — import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/metrics/AnimatedMetricCard.tsx:2` — import { motion } from 'framer-motion';
- `src/components/dashboard/metrics/GoalProgressRing.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/dashboard/metrics/MiniSparkline.tsx:2` — import { motion } from 'framer-motion';
- `src/components/dashboard/metrics/TrendIndicator.tsx:2` — import { motion } from 'framer-motion';
- `src/components/dashboard/overview/CsatCard.tsx:2` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/overview/DailyGoalsCard.tsx:3` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/overview/DashboardCard.tsx:4` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/overview/DashboardKpiCard.tsx:5` — import { motion, useMotionValue, animate, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/overview/DashboardTabs.tsx:1` — import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/overview/GreetingBanner.tsx:2` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/overview/TeamHighlightCard.tsx:2` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/dashboard/war-room/WarRoomAgentCard.tsx:1` — import { motion } from 'framer-motion';
- `src/components/dashboard/war-room/WarRoomAlertRow.tsx:1` — import { motion } from 'framer-motion';
- `src/components/dashboard/war-room/WarRoomMetricCard.tsx:1` — import { motion } from 'framer-motion';
- `src/components/dashboard/war-room/WarRoomQueueRow.tsx:1` — import { motion } from 'framer-motion';
- `src/components/diagnostics/ConnectionHealthPanel.tsx:12` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/diagnostics/DiagnosticsView.tsx:9` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/docs/SystemFeaturesView.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/effects/AuroraBorealis.tsx:1` — import { motion } from 'framer-motion';
- `src/components/effects/Confetti.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/effects/EasterEggs.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/effects/ParallaxContainer.tsx:1` — import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
- `src/components/effects/ScrollEffects.tsx:1` — import { motion, useScroll, useTransform, useSpring, useMotionValue, useVelocity, useAnimationFrame, type MotionValue } from 'framer-motion';
- `src/components/email/EmailChatBubble.tsx:2` — import { motion } from 'framer-motion';
- `src/components/email/EmailChatInbox.tsx:2` — import { AnimatePresence } from 'framer-motion';
- `src/components/email/EmailThreadList.tsx:2` — import { motion } from 'framer-motion';
- `src/components/gamification/AchievementBadge.tsx:1` — import { motion } from 'framer-motion';
- `src/components/gamification/AchievementToast.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/gamification/AchievementsPanel.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/gamification/AchievementsStats.tsx:2` — import { motion } from 'framer-motion';
- `src/components/gamification/DemoAchievements.tsx:1` — import { motion } from 'framer-motion';
- `src/components/gamification/TrainingMiniGames.tsx:2` — import { motion } from 'framer-motion';
- `src/components/gmail/EmailComposer.tsx:3` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/gmail/EmailThreadView.tsx:4` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/gmail/GmailInboxView.tsx:2` — import { AnimatePresence } from 'framer-motion';
- `src/components/gmail/ThreadListItem.tsx:1` — import { motion } from 'framer-motion';
- `src/components/inbox/AISuggestions.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/AudioMemePicker.tsx:8` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/AudioMessagePlayer.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/AudioRecorder.tsx:2` — import { motion, useMotionValue, useTransform } from 'framer-motion';
- `src/components/inbox/BulkActionsToolbar.tsx:6` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/ContactPurchasesPanel.tsx:15` — import { motion } from 'framer-motion';
- `src/components/inbox/ConversationListSidebar.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/CustomEmojiPicker.tsx:8` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/ImagePreview.tsx:3` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/InboxEmptyChat.tsx:1` — import { motion } from 'framer-motion';
- `src/components/inbox/InteractiveMessage.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/LinkPreview.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/LocationMessage.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/MediaPreview.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/MessagePreview.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/MessageReactions.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/MessageTemplates.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/NewMessageIndicator.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/QuickRepliesManager.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/ReplyQuote.tsx:1` — import { motion } from 'framer-motion';
- `src/components/inbox/SLAIndicator.tsx:3` — import { motion } from 'framer-motion';
- `src/components/inbox/SentimentIndicator.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/SlashCommands.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/StickerPicker.tsx:6` — import { AnimatePresence } from 'framer-motion';
- `src/components/inbox/SwipeableListItem.tsx:2` — import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
- `src/components/inbox/TemplatesWithVariables.tsx:10` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/TextToAudioButton.tsx:4` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/TypingIndicator.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/VideoFullscreen.tsx:3` — import { motion } from 'framer-motion';
- `src/components/inbox/VoiceChanger.tsx:4` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/VoiceChangerPicker.tsx:6` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/ai-tools/AIResponseCard.tsx:4` — import { motion } from 'framer-motion';
- `src/components/inbox/ai-tools/AnalysisTabs.tsx:1` — import { motion } from 'framer-motion';
- `src/components/inbox/ai-tools/HistoryTab.tsx:1` — import { motion } from 'framer-motion';
- `src/components/inbox/ai-tools/KeyPointsTab.tsx:1` — import { motion } from 'framer-motion';
- `src/components/inbox/ai-tools/SummaryTab.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/ai-tools/ToolPanel.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/chat/ChatInputArea.tsx:7` — import { AnimatePresence, motion } from 'framer-motion';
- `src/components/inbox/chat/ChatSearchBar.tsx:6` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/chat/ChatSearchResultsList.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/chat/ConversationTabs.tsx:1` — import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
- `src/components/inbox/chat/InputPreviewBars.tsx:1` — import { AnimatePresence, motion } from 'framer-motion';
- `src/components/inbox/chat/MentionAutocomplete.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/chat/PinnedConversationsStack.tsx:2` — import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
- `src/components/inbox/chat/RichTextToolbar.tsx:6` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/collaboration/InternalNotesPanel.tsx:11` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/collaboration/MentionInput.tsx:9` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/contact-details/CompactContactHeader.tsx:3` — import { motion } from 'framer-motion';
- `src/components/inbox/contact-details/Contact360Helpers.tsx:7` — import { motion } from 'framer-motion';
- `src/components/inbox/contact-details/ContactHeaderSection.tsx:7` — import { motion } from 'framer-motion';
- `src/components/inbox/contact-details/ContactIntelligencePanel.tsx:13` — import { motion } from 'framer-motion';
- `src/components/inbox/contact-details/ExternalContact360Panel.tsx:8` — import { motion } from 'framer-motion';
- `src/components/inbox/contact-details/sidebar/SidebarSection.tsx:2` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/inbox/quick-replies/QuickReplyCardList.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/quick-replies/QuickReplyDialog.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/search/GlobalSearchFilters.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/search/GlobalSearchResults.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/stickers/PersonalStickers.tsx:11` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/stickers/StickerGrid.tsx:3` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/stickers/StickerManager.tsx:18` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/stickers/StickerUploadPreview.tsx:4` — import { motion } from 'framer-motion';
- `src/components/inbox/summary/SummaryResult.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/tabs/ContactStatsStrip.tsx:4` — import { motion } from 'framer-motion';
- `src/components/inbox/tabs/journey/motion/Collapse.tsx:10` — import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
- `src/components/inbox/tabs/journey/motion/FadeSlideIn.tsx:9` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/inbox/tabs/journey/motion/HighlightPulse.tsx:10` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/inbox/tabs/journey/motion/__tests__/FadeSlideIn.test.tsx:19` — import { motion } from 'framer-motion';
- `src/components/inbox/tabs/journey/motion/useCountUp.ts:21` — import { useReducedMotion } from 'framer-motion';
- `src/components/integrations/GoogleCalendarIntegration.tsx:2` — import { motion } from 'framer-motion';
- `src/components/integrations/IntegrationsHub.tsx:2` — import { motion } from 'framer-motion';
- `src/components/integrations/N8nIntegrationView.tsx:2` — import { motion } from 'framer-motion';
- `src/components/integrations/SentryIntegrationView.tsx:2` — import { motion } from 'framer-motion';
- `src/components/keyboard/KeyboardShortcutsDialog.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/knowledge/KnowledgeBaseView.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/layout/PageTemplate.tsx:3` — import { motion } from 'framer-motion';
- `src/components/layout/SidebarNavGroup.tsx:4` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/leaderboard/Leaderboard.tsx:1` — import { motion } from 'framer-motion';
- `src/components/leaderboard/LeaderboardHelpers.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mfa/MFABackupCodes.tsx:3` — import { motion } from 'framer-motion';
- `src/components/mfa/MFAEnroll.tsx:2` — import { motion } from 'framer-motion';
- `src/components/mfa/MFASettings.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mfa/MFAVerify.tsx:2` — import { motion } from 'framer-motion';
- `src/components/mobile/BottomSheet.tsx:2` — import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
- `src/components/mobile/FloatingActionButtons.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/InAppNotification.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/MiniChatPiP.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/MobileDrawerMenu.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/MobileFAB.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/MobileHeader.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/MobileNavigation.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/MobilePullToRefresh.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/MobileSlidePanel.tsx:2` — import { motion, AnimatePresence, useDragControls, PanInfo } from 'framer-motion';
- `src/components/mobile/NotificationsPanel.tsx:13` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/SwipeGestures.tsx:2` — import { motion, useMotionValue, useTransform, PanInfo, AnimatePresence } from 'framer-motion';
- `src/components/mobile/SwipeableMessage.tsx:2` — import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
- `src/components/mobile/TouchRipple.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/mobile/VoiceDictationButton.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/monitoring/EvolutionMonitoringDashboard.tsx:5` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/monitoring/MonitoringConnectionsList.tsx:9` — import { motion } from 'framer-motion';
- `src/components/monitoring/MonitoringDiagnosticPanel.tsx:7` — import { motion } from 'framer-motion';
- `src/components/monitoring/MonitoringEventTimeline.tsx:10` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/monitoring/MonitoringHealthLogs.tsx:12` — import { motion } from 'framer-motion';
- `src/components/monitoring/MonitoringSLAPanel.tsx:6` — import { motion } from 'framer-motion';
- `src/components/monitoring/MonitoringStatsCards.tsx:4` — import { motion } from 'framer-motion';
- `src/components/notifications/NotificationSettingsPanel.tsx:12` — import { motion } from 'framer-motion';
- `src/components/omnichannel/OmnichannelInbox.tsx:2` — import { motion } from 'framer-motion';
- `src/components/omnichannel/OmnichannelManager.tsx:5` — import { motion } from 'framer-motion';
- `src/components/onboarding/OnboardingChecklist.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/onboarding/TourOverlay.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/payments/PaymentLinksView.tsx:3` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/performance/LazyRoutes.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/performance/OptimizedImage.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/performance/VirtualizedList.tsx:3` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/permissions/PermissionMatrix.tsx:2` — import { motion } from 'framer-motion';
- `src/components/queues/QueueAlertsDisplay.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/queues/SLAAgentTable.tsx:1` — import { motion } from 'framer-motion';
- `src/components/queues/SLADashboard.tsx:11` — import { motion } from 'framer-motion';
- `src/components/queues/SLAMetricCards.tsx:1` — import { motion } from 'framer-motion';
- `src/components/reports/ReportCharts.tsx:10` — import { motion } from 'framer-motion';
- `src/components/reports/ScheduledReportsManager.tsx:36` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/schedule/ScheduleCalendarView.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/security/AuditLogDashboard.tsx:2` — import { motion } from 'framer-motion';
- `src/components/security/BlockedIPsPanel.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/security/DeviceCard.tsx:1` — import { motion } from 'framer-motion';
- `src/components/security/GeoBlockingPanel.tsx:1` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/security/IPWhitelistPanel.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/security/PasskeysPanel.tsx:9` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/security/PasswordResetRequestsPanel.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/security/RateLimitConfigPanel.tsx:4` — import { motion } from 'framer-motion';
- `src/components/security/RateLimitRealtimeAlerts.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/security/SecurityNotificationsPanel.tsx:2` — import { motion } from 'framer-motion';
- `src/components/security/SecurityOverview.tsx:2` — import { motion } from 'framer-motion';
- `src/components/security/SecurityPanels.tsx:1` — import { motion } from 'framer-motion';
- `src/components/security/SecuritySettingsPanel.tsx:2` — import { motion } from 'framer-motion';
- `src/components/settings/AvatarUpload.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/settings/KeyboardShortcutsSettings.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/settings/MediaLibraryAdmin.tsx:11` — import { AnimatePresence, motion } from 'framer-motion';
- `src/components/settings/SLAConfigurationManager.tsx:16` — import { motion } from 'framer-motion';
- `src/components/settings/SLARulesManager.tsx:7` — import { motion } from 'framer-motion';
- `src/components/settings/SoundCategoryCard.tsx:1` — import { motion } from 'framer-motion';
- `src/components/settings/SoundCustomizationPanel.tsx:10` — import { AnimatePresence, motion } from 'framer-motion';
- `src/components/settings/ThemeCustomizer.tsx:1` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/settings/ai-providers/AIProviderCard.tsx:12` — import { motion } from 'framer-motion';
- `src/components/settings/ai-providers/AIProviderHealthPanel.tsx:9` — import { motion } from 'framer-motion';
- `src/components/settings/sla/SLARuleRow.tsx:7` — import { motion } from 'framer-motion';
- `src/components/settings/sla/ScopeRulesList.tsx:9` — import { motion } from 'framer-motion';
- `src/components/settings/theme/PresetCard.tsx:2` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/sla/SLACharts.tsx:1` — import { motion } from 'framer-motion';
- `src/components/sla/SLAHistoryDashboard.tsx:5` — import { motion } from 'framer-motion';
- `src/components/talkx/TalkXLiveMonitor.tsx:10` — import { motion } from 'framer-motion';
- `src/components/talkx/kit/kpi.tsx:2` — import { useReducedMotion } from 'framer-motion';
- `src/components/tasks/TasksModule.tsx:2` — import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
- `src/components/tasks/__tests__/movimentoEContraste.test.tsx:142` — expect(modulo).toMatch(/import \{[^}]*useReducedMotion[^}]*\} from 'framer-motion'/);
- `src/components/tasks/list/TasksListMode.tsx:2` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/tasks/shared/ModeSwitcher.tsx:2` — import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
- `src/components/team-chat/TeamChatInputArea.tsx:6` — import { AnimatePresence, motion } from 'framer-motion';
- `src/components/team-chat/TeamChatPanel.tsx:9` — import { AnimatePresence, motion } from 'framer-motion';
- `src/components/team-chat/TeamChatView.tsx:11` — import { motion } from 'framer-motion';
- `src/components/transcriptions/TranscriptionContactGroup.tsx:2` — import { motion } from 'framer-motion';
- `src/components/ui/EmptyState.tsx:3` — import { motion } from 'framer-motion';
- `src/components/ui/GenericEmptyState.tsx:15` — import { motion } from 'framer-motion';
- `src/components/ui/SkeletonList.tsx:3` — import { motion } from 'framer-motion';
- `src/components/ui/avatar.tsx:4` — import { motion } from "framer-motion";
- `src/components/ui/command-palette.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ui/emoji-picker.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ui/empty-state-illustrations.tsx:1` — import { motion } from 'framer-motion';
- `src/components/ui/empty-state.tsx:1` — import { motion } from 'framer-motion';
- `src/components/ui/empty-states.tsx:2` — import { motion } from 'framer-motion';
- `src/components/ui/empty-states/ContextualEmptyState.tsx:2` — import { motion } from 'framer-motion';
- `src/components/ui/icon-button.tsx:4` — import { motion, HTMLMotionProps } from 'framer-motion';
- `src/components/ui/liquid-metal-button.tsx:4` — import { useReducedMotion } from 'framer-motion';
- `src/components/ui/micro-interactions/buttons.tsx:3` — import { motion, AnimatePresence, useAnimation } from 'framer-motion';
- `src/components/ui/micro-interactions/feedback.tsx:3` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ui/micro-interactions/skeletons.tsx:3` — import { motion } from 'framer-motion';
- `src/components/ui/mobile-components.tsx:2` — import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
- `src/components/ui/motion/components.tsx:1` — import { motion, HTMLMotionProps, Variants, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/ui/motion/effects.tsx:1` — import { motion, AnimatePresence, Variants } from 'framer-motion';
- `src/components/ui/motion/variants.ts:1` — import { Variants } from 'framer-motion';
- `src/components/ui/quick-peek.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ui/route-loading-bar.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ui/scroll-to-top.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ui/skip-link.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ui/sparkline.tsx:1` — import { motion } from 'framer-motion';
- `src/components/ui/step-progress.tsx:3` — import { motion } from 'framer-motion';
- `src/components/voice/AudioFrequencyVisualizer.tsx:2` — import { useReducedMotion } from 'framer-motion';
- `src/components/voice/VoiceOrb.tsx:1` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/voice/VoiceSearchOverlay.tsx:3` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/voice/VoiceSuggestions.tsx:1` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/voice/VoiceTranscriptArea.tsx:1` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/whatsapp-flows/WhatsAppFlowsBuilder.tsx:5` — import { motion } from 'framer-motion';

---

## Importadores Não Iniciais (lazy/dynamic) — 24

- `src/components/alerts/EvolutionDisconnectBanner.tsx:3` — import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
- `src/components/campaigns/CampaignABTesting.tsx:11` — import { motion } from 'framer-motion';
- `src/components/contacts/ContactsView.tsx:2` — import { MotionConfig } from 'framer-motion';
- `src/components/dashboard/SentimentAlertsDashboard.tsx:2` — import { motion } from 'framer-motion';
- `src/components/groups/GroupsView.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/AIConversationAssistant.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/ContactDetails.tsx:10` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/ConversationSummary.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/ForwardMessageDialog.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/InteractiveMessageBuilder.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/LocationPicker.tsx:2` — import { motion, useReducedMotion } from 'framer-motion';
- `src/components/inbox/NewConversationModal.tsx:12` — import { motion } from 'framer-motion';
- `src/components/inbox/NextBestActionEngine.tsx:3` — import { motion } from 'framer-motion';
- `src/components/inbox/ObjectionDetector.tsx:6` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/RealtimeTranscription.tsx:3` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/ScheduleMessageDialog.tsx:2` — import { motion } from 'framer-motion';
- `src/components/inbox/TransferDialog.tsx:3` — import { motion } from 'framer-motion';
- `src/components/inbox/UniversityHelp.tsx:6` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/inbox/WhisperMode.tsx:5` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/onboarding/WelcomeModal.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/reports/AdvancedReportsView.tsx:14` — import { motion } from 'framer-motion';
- `src/components/security/SecurityView.tsx:2` — import { motion } from 'framer-motion';
- `src/components/transcriptions/TranscriptionsHistoryView.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';
- `src/components/ui/offline-indicator.tsx:2` — import { motion, AnimatePresence } from 'framer-motion';

---

## Importações de Tipo

- `src/components/transitions/transitionVariants.ts:1` — import type { Variants, Variant } from 'framer-motion';

---

## Re-export

- `src/components/ui/motion.tsx:22` — export { AnimatePresence, motion } from 'framer-motion';

---

## Nota sobre a contagem

O cartão menciona 330 importadores. A contagem real é 331, que inclui 1 re-export (`src/components/ui/motion.tsx`). A diferença de 1 é explicada pelo re-export que re-exporta `AnimatePresence` e `motion` de `framer-motion`. Além disso, há 1 importação de tipo (`transitionVariants.ts:1`), totalizando 332 linhas de grep (330 classificados + 1 tipo + 1 re-export).
