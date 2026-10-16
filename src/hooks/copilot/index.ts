/**
 * Barrel de hooks do Copiloto de Vendas (RADAR) — Fases 7–15.
 */

// Phase 7 — Ghost Text, Feedback, Templates, Attachments, Voice
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

// Phase 10 — Lead Signals, Speed-to-Lead, Follow-Up
export { useLeadThermometer } from './useLeadThermometer';
export type { UseLeadThermometerOptions, ThermometerState, LeadTemperature, BuySignal } from './useLeadThermometer';

export { useSpeedToLead } from './useSpeedToLead';
export type { UseSpeedToLeadOptions, SpeedToLeadState, AlertLevel } from './useSpeedToLead';

export { useFirstReply } from './useFirstReply';
export type { UseFirstReplyOptions, FirstReplySuggestion } from './useFirstReply';

export { useFollowUp } from './useFollowUp';
export type { UseFollowUpOptions, FollowUpSuggestion, SilenceAlert, FollowUpReason } from './useFollowUp';

// Phase 11 — Multimodal Analysis
export { useAudioAnalysis } from './useAudioAnalysis';
export type { AudioAnalysisResult } from './useAudioAnalysis';

export { useImageAnalysis } from './useImageAnalysis';
export type { ImageContext } from './useImageAnalysis';

export { useDocumentAnalysis } from './useDocumentAnalysis';
export type { DocumentContext } from './useDocumentAnalysis';

export { useMultimodalContext } from './useMultimodalContext';
export type { MultimodalContext } from './useMultimodalContext';

// Phase 12 — Privacy, Tone, Guardrails
export * from './usePrivacyGuard';
export * from './useToneGuard';
export * from './useSuggestionFilter';
export * from './useLGPDConsent';

// Phase 13 — Supervisor, Coaching
export * from './useSupervisorView';
export * from './useCoachingHint';
export * from './useTrainingMode';

// Phase 14 — Analytics, Conversion, A/B, Benchmarks
export { useCopilotAnalytics } from './useCopilotAnalytics';
export type { CopilotMetrics, CopilotEvent } from './useCopilotAnalytics';

export { useConversionTracker } from './useConversionTracker';
export type { ConversionEvent, ConversionStats } from './useConversionTracker';

export { useABTest } from './useABTest';
export type { ABVariant, ABTestConfig } from './useABTest';

export { usePerformanceBenchmark } from './usePerformanceBenchmark';
export type { BenchmarkResult } from './usePerformanceBenchmark';

// Phase 15 — Integration, Master Panel, Keyboard, Persistence
export { useRadarOrchestrator } from './useRadarOrchestrator';
export type { RadarOrchestratorState } from './useRadarOrchestrator';

export { useRadarKeyboard } from './useRadarKeyboard';
export type { RadarShortcut, UseRadarKeyboardHandlers, UseRadarKeyboardReturn } from './useRadarKeyboard';

export { useRadarPersistence } from './useRadarPersistence';
export type { RadarPersistentState, UseRadarPersistenceReturn } from './useRadarPersistence';
