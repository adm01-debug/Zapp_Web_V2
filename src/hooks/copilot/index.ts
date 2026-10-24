/**
 * Barrel de hooks do Copiloto de Vendas (RADAR) — Fases 7–15.
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

// Phase 8
export { useObjectionHandler } from './useObjectionHandler';
export type {
  UseObjectionHandlerOptions,
  ObjectionHandlerActions,
  ObjectionHandlerState,
  ObjectionType,
  Battlecard,
} from './useObjectionHandler';

export { usePriceAnchor } from './usePriceAnchor';
export type {
  UsePriceAnchorOptions,
  PriceAnchorActions,
  PriceAnchorState,
} from './usePriceAnchor';

export { useLossRisk } from './useLossRisk';
export type {
  UseLossRiskOptions,
  LossRiskActions,
  LossRiskState,
  LossRiskSignal,
  RiskLevel,
} from './useLossRisk';

// Phase 9
export { useProductRecommendation } from './useProductRecommendation';
export type {
  UseProductRecommendationOptions,
  ProductRecommendationActions,
  ProductRecommendationState,
  ProductSuggestion,
} from './useProductRecommendation';

export { useDeadlineCalculator } from './useDeadlineCalculator';
export type {
  UseDeadlineCalculatorOptions,
  DeadlineCalculatorActions,
  DeadlineCalculatorState,
  DeadlineBreakdown,
  FreightEstimate,
  QuoteDraft,
} from './useDeadlineCalculator';

// Phase 10
export { useLeadTemperature } from './useLeadTemperature';
export type {
  UseLeadTemperatureOptions,
  LeadTemperatureActions,
  LeadTemperatureState,
  BuyingSignal,
  FollowUpRecommendation,
  TemperatureLabel,
} from './useLeadTemperature';

// Phase 11
export { useMultimodalAnalysis } from './useMultimodalAnalysis';
export type {
  UseMultimodalAnalysisOptions,
  MultimodalAnalysisActions,
  MultimodalAnalysisState,
  MultimodalResult,
  AnalysisType,
} from './useMultimodalAnalysis';

// Phase 12
export { useFactChecker } from './useFactChecker';
export type {
  UseFactCheckerOptions,
  FactCheckerActions,
  FactCheckerState,
  SafetyIssue,
  SafetyIssueType,
} from './useFactChecker';

// Phase 13
export { useSupervisorFeatures } from './useSupervisorFeatures';
export type {
  UseSupervisorFeaturesOptions,
  SupervisorFeaturesActions,
  SupervisorFeaturesState,
  SupervisorWhisper,
  LearningMoment,
} from './useSupervisorFeatures';

// Phase 14
export { useCopilotLearning } from './useCopilotLearning';
export type {
  UseCopilotLearningOptions,
  CopilotLearningActions,
  CopilotLearningState,
  PromptVariant,
} from './useCopilotLearning';

// Phase 15
export { useCopilotMetrics } from './useCopilotMetrics';
export type {
  UseCopilotMetricsOptions,
  CopilotMetricsActions,
  CopilotMetricsState,
  UsageRecord,
} from './useCopilotMetrics';
