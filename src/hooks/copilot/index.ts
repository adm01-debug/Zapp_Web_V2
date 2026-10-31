/**
 * Barrel de hooks do Copiloto de Vendas (RADAR) — Fases 7–15.
 */

// ── Fase 7 (CV-061-070) ──────────────────────────────────────────────────────
export { useGhostText } from './useGhostText';
export type { UseGhostTextOptions, GhostTextState } from './useGhostText';

export { useCopilotFeedback } from './useCopilotFeedback';
export type { UseCopilotFeedbackOptions, CopilotFeedbackActions, FeedbackRating, FeedbackReason, EditLevel } from './useCopilotFeedback';

export { useSmartTemplates } from './useSmartTemplates';
export type { UseSmartTemplatesOptions, RankedTemplate, SaleContext } from './useSmartTemplates';

export { useAttachmentSuggestion } from './useAttachmentSuggestion';
export type { UseAttachmentSuggestionOptions, AttachmentSuggestion, AttachmentType, AttachmentAsset } from './useAttachmentSuggestion';

export { useVoiceDictation } from './useVoiceDictation';
export type { UseVoiceDictationOptions, UseVoiceDictationReturn, DictationState } from './useVoiceDictation';

// ── Fase 8 (CV-071-080) — Objeções ───────────────────────────────────────────
export { useObjectionHandler } from './useObjectionHandler';
export { useBattleCard } from './useBattleCard';
export { usePriceAnchoring } from './usePriceAnchoring';
export { useDiscountGuardrail } from './useDiscountGuardrail';
export { useTradeOffer } from './useTradeOffer';
export { useVouPensarDetector } from './useVouPensarDetector';
export { useStallDetector } from './useStallDetector';
export { useMinQuantityAlert } from './useMinQuantityAlert';
export { useMinQuantityAlternative } from './useMinQuantityAlternative';
export { useLossRiskDetector } from './useLossRiskDetector';
export { usePostRejection } from './usePostRejection';

// ── Fase 9 (CV-081-090) — Catálogo, Prazo, Orçamento ─────────────────────────
export { useDeadlineCalculator } from './useDeadlineCalculator';
export { useHonestUrgency } from './useHonestUrgency';
export { useQuoteDraft } from './useQuoteDraft';
export { useFreightEstimate } from './useFreightEstimate';
export { useUpsellSuggestion } from './useUpsellSuggestion';
export { useOccasionKits } from './useOccasionKits';
export { useMockupTrigger } from './useMockupTrigger';
export { useUrgencyEscalation } from './useUrgencyEscalation';

// ── Fase 10 (CV-091-100) — Lead, Follow-up, Silêncio ─────────────────────────
export { useLeadThermometer } from './useLeadThermometer';
export { usePurchaseSignals } from './usePurchaseSignals';
export { useSpeedToLead } from './useSpeedToLead';
export { useFirstResponseScript } from './useFirstResponseScript';
export { useFollowUpTiming } from './useFollowUpTiming';
export { useFollowUpContent } from './useFollowUpContent';
export { useNonAnnoyingFollowUp } from './useNonAnnoyingFollowUp';
export { useSilenceDetector } from './useSilenceDetector';

// ── Fase 11 (CV-101-110) — Multimodal ────────────────────────────────────────
export { useAudioTranscription } from './useAudioTranscription';
export type { AudioTranscriptionResult } from './useAudioTranscription';

export { useImageAnalysis } from './useImageAnalysis';
export type { ImageAnalysisResult } from './useImageAnalysis';

export { usePdfExtraction } from './usePdfExtraction';
export type { PdfExtractionResult } from './usePdfExtraction';

export { useAudioTone } from './useAudioTone';
export type { AudioToneResult, AudioToneType } from './useAudioTone';

export { useLogoAnalysis } from './useLogoAnalysis';
export type { UseLogoAnalysisOptions, LogoAnalysisResult, LogoFormat } from './useLogoAnalysis';

export { useBrandColors } from './useBrandColors';
export type { BrandColorsResult, BrandColor } from './useBrandColors';

export { useMediaPrivacy } from './useMediaPrivacy';
export type { UseMediaPrivacyOptions, MediaPrivacyResult, PrivacyRisk } from './useMediaPrivacy';

// ── Fase 12 (CV-111-120) — Guardrails ────────────────────────────────────────
export { useLiveScoring } from './useLiveScoring';
export type { UseLiveScoringOptions, LiveConversationScore } from './useLiveScoring';

export { useGuardrails } from './useGuardrails';
export type { GuardrailViolation } from './useGuardrails';

export { useLgpdFilter } from './useLgpdFilter';

export { usePIIDetector } from './usePIIDetector';
export type { UsePIIDetectorOptions, PIIDetectorResult, PIIDetection, PIIType } from './usePIIDetector';

export { useDataMasking } from './useDataMasking';
export type { DataMaskingResult, MaskedField } from './useDataMasking';

export { useNegotiationGuard } from './useNegotiationGuard';
export type { UseNegotiationGuardOptions, NegotiationGuardResult } from './useNegotiationGuard';

export { useVendorAuthorization } from './useVendorAuthorization';
export type { UseVendorAuthorizationOptions, AuthorizationResult, VendorLevel, SensitiveAction } from './useVendorAuthorization';

export { useBiasChecker } from './useBiasChecker';
export type { BiasCheckerResult, BiasFlag, BiasCategory } from './useBiasChecker';

// ── Fase 13 (CV-121-130) — Supervisor ────────────────────────────────────────
export { useSupervisorInsights } from './useSupervisorInsights';
export type { SupervisorInsight } from './useSupervisorInsights';

export { useCopilotSupervisor } from './useCopilotSupervisor';
export type { SupervisorResult, CopilotInsight, InsightPriority, InsightSource } from './useCopilotSupervisor';

export { useSupervisorDashboard } from './useSupervisorDashboard';
export type { UseSupervisorDashboardOptions, SupervisorDashboardResult, CopilotSessionSummary } from './useSupervisorDashboard';

export { useWhisperChannel } from './useWhisperChannel';
export type { UseWhisperChannelOptions, WhisperChannelState, WhisperMessage } from './useWhisperChannel';

export { useCoachingTip } from './useCoachingTip';

export { useConversationScore } from './useConversationScore';
export type { ConversationScoreResult, ConversationScoreDimension, BrindeCompleteness } from './useConversationScore';

export { useLearningMoment } from './useLearningMoment';
export type { LearningMoment, LearningMomentType } from './useLearningMoment';

// ── Fase 14 (CV-131-140) — Aprendizado ───────────────────────────────────────
export { useCopilotLearning } from './useCopilotLearning';
export type { LearningRecord, SuggestionOutcome } from './useCopilotLearning';

export { usePromptVersioning } from './usePromptVersioning';

export { useAiJudge } from './useAiJudge';

// ── Fase 15 (CV-141-150) — Métricas ──────────────────────────────────────────
export { useCostDashboard } from './useCostDashboard';
