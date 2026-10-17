/**
 * Barrel de hooks do Copiloto de Vendas (RADAR) — Fase 7 a Fase 14.
 */
export { useGhostText } from './useGhostText';
export type { UseGhostTextOptions, GhostTextState } from './useGhostText';

export { useCopilotFeedback } from './useCopilotFeedback';
export type {
  UseCopilotFeedbackOptions,
  CopilotFeedbackActions,
  FeedbackRating,
  FeedbackReason,
  EditLevel,
} from './useCopilotFeedback';

export { useSmartTemplates } from './useSmartTemplates';
export type {
  UseSmartTemplatesOptions,
  RankedTemplate,
  SaleContext,
} from './useSmartTemplates';

export { useAttachmentSuggestion } from './useAttachmentSuggestion';
export type {
  UseAttachmentSuggestionOptions,
  AttachmentSuggestion,
  AttachmentType,
  AttachmentAsset,
} from './useAttachmentSuggestion';

export { useVoiceDictation } from './useVoiceDictation';
export type {
  UseVoiceDictationOptions,
  UseVoiceDictationReturn,
  DictationState,
} from './useVoiceDictation';

// Phase 8 — Objections, Competitors, Price
export { useObjectionDetector } from './useObjectionDetector';
export type { UseObjectionDetectorOptions, ObjectionClassification, ObjectionType } from './useObjectionDetector';

export { useBattlecard } from './useBattlecard';
export type { UseBattlecardOptions, BattlecardEntry } from './useBattlecard';

export { usePriceAnchor } from './usePriceAnchor';
export type { UsePriceAnchorOptions, PriceAnchorSuggestion, DiscountRequest } from './usePriceAnchor';

export { useLossRiskDetector } from './useLossRiskDetector';
export type { UseLossRiskOptions, LossRiskState, LossRiskLevel, LossSignal } from './useLossRiskDetector';

export { useMinimumQty } from './useMinimumQty';
export type { UseMinimumQtyOptions, QtyAlternative } from './useMinimumQty';

// Phase 9 — Catalog, Budget, Timeline
export { useProductRecommendation } from './useProductRecommendation';
export type { UseProductRecommendationOptions, ProductRecommendation, ProductStock } from './useProductRecommendation';

export { useReverseDeadline, DEFAULT_PHASES } from './useReverseDeadline';
export type { UseReverseDeadlineOptions, DeadlineResult, DeadlinePhase } from './useReverseDeadline';

export { useQuoteDraft } from './useQuoteDraft';
export type { UseQuoteDraftOptions, QuoteDraft, QuoteItem, FreightEstimate, UpsellSuggestion } from './useQuoteDraft';

export { useMockupTrigger } from './useMockupTrigger';
export type { UseMockupTriggerOptions, IncomingAttachment, MessageAttachmentType } from './useMockupTrigger';

// Phase 10 — Signals, Temperature, Timing, Follow-up
export { useLeadThermometer } from './useLeadThermometer';
export type { LeadThermometerOptions, LeadTemperature, BRINDEFields, TemperatureLevel } from './useLeadThermometer';

export { useBuySignalDetector } from './useBuySignalDetector';
export type { BuySignalDetectorOptions, BuySignal } from './useBuySignalDetector';

export { useSpeedToLead } from './useSpeedToLead';
export type { UseSpeedToLeadOptions, SpeedToLeadState, SpeedToLeadLevel } from './useSpeedToLead';

export { useFirstResponseSuggestion } from './useFirstResponseSuggestion';
export type { FirstResponseContext, FirstResponseSuggestion } from './useFirstResponseSuggestion';

export { useFollowUpTiming } from './useFollowUpTiming';
export type { FollowUpTimingOptions, FollowUpTiming } from './useFollowUpTiming';

export { useFollowUpDraft, validateFollowUp } from './useFollowUpDraft';
export type { UseFollowUpDraftOptions, FollowUpDraft, FollowUpElementType } from './useFollowUpDraft';

export { useWhatsAppWindowAlert } from './useWhatsAppWindowAlert';
export type { UseWhatsAppWindowAlertOptions, WhatsAppWindowState, WhatsAppFlavor } from './useWhatsAppWindowAlert';

export { useSilenceDetector } from './useSilenceDetector';
export type { UseSilenceDetectorOptions, SilentLead, SilentLeadInput } from './useSilenceDetector';

// Phase 11 — Multimodal: áudio, imagem, documento
export { useAudioTranscription } from './useAudioTranscription';
export type { UseAudioTranscriptionOptions, AudioTranscriptionState } from './useAudioTranscription';

export { useAudioToneDetector } from './useAudioToneDetector';
export type { UseAudioToneDetectorOptions, AudioToneResult, AudioTone } from './useAudioToneDetector';

export { useImageReference } from './useImageReference';
export type { UseImageReferenceOptions, ImageReferenceState } from './useImageReference';

export { useLogoAnalysis } from './useLogoAnalysis';
export type { UseLogoAnalysisOptions, LogoAnalysisResult, LogoQuality } from './useLogoAnalysis';

export { useLogoColors } from './useLogoColors';
export type { UseLogoColorsOptions, LogoColorsResult, ColorEntry } from './useLogoColors';

export { usePdfBriefingExtractor } from './usePdfBriefingExtractor';
export type { UsePdfBriefingExtractorOptions, PdfExtractionState } from './usePdfBriefingExtractor';

export { useCompetitorQuoteAnalysis } from './useCompetitorQuoteAnalysis';
export type { UseCompetitorQuoteOptions, CompetitorQuoteState, CompetitorItem } from './useCompetitorQuoteAnalysis';

export { useAudioSuggestion } from './useAudioSuggestion';
export type { UseAudioSuggestionOptions, AudioSuggestionState } from './useAudioSuggestion';

export { useMultimodalCostGuard } from './useMultimodalCostGuard';
export type { UseMultimodalCostGuardOptions, MultimodalCostGuardResult } from './useMultimodalCostGuard';

export { useMediaPrivacy } from './useMediaPrivacy';
export type { UseMediaPrivacyOptions, MediaPrivacyResult } from './useMediaPrivacy';

// Phase 12 — Guardrails, segurança e LGPD
export { useFactChecker } from './useFactChecker';
export type { UseFactCheckerOptions, FactCheckState, FactViolation } from './useFactChecker';

export { useProhibitedPromises } from './useProhibitedPromises';
export type { UseProhibitedPromisesOptions, ProhibitedPromisesState } from './useProhibitedPromises';

export { usePromptInjectionGuard } from './usePromptInjectionGuard';
export type { UsePromptInjectionGuardOptions, PromptInjectionResult } from './usePromptInjectionGuard';

export { useSensitiveDataMasker } from './useSensitiveDataMasker';
export type { UseSensitiveDataMaskerOptions, SensitiveDataMaskerResult } from './useSensitiveDataMasker';

export { useLGPDRetention } from './useLGPDRetention';
export type { UseLGPDRetentionOptions, LGPDRetentionState } from './useLGPDRetention';

export { useCopilotAuthorization } from './useCopilotAuthorization';
export type { UseCopilotAuthorizationOptions, CopilotAuthorizationResult } from './useCopilotAuthorization';

export { useBiasGuard } from './useBiasGuard';
export type { UseBiasGuardOptions, BiasGuardResult, BiasEvent } from './useBiasGuard';

export { useEmergencyStop } from './useEmergencyStop';
export type { UseEmergencyStopOptions, EmergencyStopResult } from './useEmergencyStop';

// Phase 13 — Supervisor, coaching e treinamento
export { useSupervisorControlTower } from './useSupervisorControlTower';
export type { UseSupervisorControlTowerOptions, SupervisorControlTowerState, ActiveConversation } from './useSupervisorControlTower';

export { useSupervisorWhisper } from './useSupervisorWhisper';
export type { UseSupervisorWhisperOptions, SupervisorWhisperState, WhisperMessage } from './useSupervisorWhisper';

export { useHelpRequest } from './useHelpRequest';
export type { UseHelpRequestOptions, HelpRequestState, HelpRequest, RadarBriefing } from './useHelpRequest';

export { useConversationScore } from './useConversationScore';
export type { UseConversationScoreOptions, ConversationScoreState, ConversationScore, ConversationScoreCriteria } from './useConversationScore';

export { useLearningMoment } from './useLearningMoment';
export type { UseLearningMomentOptions, LearningMomentState, LearningMoment } from './useLearningMoment';

export { useRolePlaySimulator } from './useRolePlaySimulator';
export type { UseRolePlaySimulatorOptions, RolePlaySimulatorState, RolePlaySession, RolePlayMessage, RolePlayCharacter } from './useRolePlaySimulator';

export { useApprenticePath } from './useApprenticePath';
export type { UseApprenticePathOptions, ApprenticePathState, ApprenticeExplanation, ApprenticeWeeklyProgress } from './useApprenticePath';

export { useWinningPlayRanking } from './useWinningPlayRanking';
export type { UseWinningPlayRankingOptions, WinningPlayRankingState, WinningPlayRankingReport, WinningPlay } from './useWinningPlayRanking';

export { useWeeklyVendorReport } from './useWeeklyVendorReport';
export type { UseWeeklyVendorReportOptions, WeeklyVendorReportState, WeeklyVendorReport } from './useWeeklyVendorReport';

export { useWinningResponseLibrary } from './useWinningResponseLibrary';
export type { UseWinningResponseLibraryOptions, WinningResponseLibraryState, WinningResponse, PendingCandidateResponse } from './useWinningResponseLibrary';

// Phase 14 — Aprendizado contínuo e avaliação
export { useConversationPatternAnalyzer } from './useConversationPatternAnalyzer';
export type { UseConversationPatternAnalyzerOptions, ConversationPatternAnalyzerState, ConversationPattern } from './useConversationPatternAnalyzer';

export { useObjectionPatternLibrary } from './useObjectionPatternLibrary';
export type { UseObjectionPatternLibraryOptions, ObjectionPatternLibraryState, ObjectionPattern } from './useObjectionPatternLibrary';

export { useRADARAccuracyTracker } from './useRADARAccuracyTracker';
export type { UseRADARAccuracyTrackerOptions, RADARAccuracyTrackerState, AccuracyMetrics } from './useRADARAccuracyTracker';

export { useContextualKnowledgeBase } from './useContextualKnowledgeBase';
export type { UseContextualKnowledgeBaseOptions, ContextualKnowledgeBaseState, KnowledgeEntry } from './useContextualKnowledgeBase';

export { usePersonalizedCoaching } from './usePersonalizedCoaching';
export type { UsePersonalizedCoachingOptions, PersonalizedCoachingState, CoachingRecommendation } from './usePersonalizedCoaching';

export { useTeamBenchmark } from './useTeamBenchmark';
export type { UseTeamBenchmarkOptions, TeamBenchmarkState, TeamBenchmark, BenchmarkEntry } from './useTeamBenchmark';

export { useConversionFunnelAnalysis } from './useConversionFunnelAnalysis';
export type { UseConversionFunnelAnalysisOptions, ConversionFunnelAnalysisState, ConversionFunnel, FunnelStage } from './useConversionFunnelAnalysis';

export { useRADARImpactReport } from './useRADARImpactReport';
export type { UseRADARImpactReportOptions, RADARImpactReportState, RADARImpactReport, ImpactMetric } from './useRADARImpactReport';

export { usePredictiveLeadScore } from './usePredictiveLeadScore';
export type { UsePredictiveLeadScoreOptions, PredictiveLeadScoreState, PredictiveLeadScore } from './usePredictiveLeadScore';

export { useContinuousImprovement } from './useContinuousImprovement';
export type { UseontinuousImprovementOptions, ContinuousImprovementState, ImprovementGap } from './useContinuousImprovement';
