/**
 * Barrel de hooks do Copiloto de Vendas (RADAR) — Fase 7 + Fase 8.
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
