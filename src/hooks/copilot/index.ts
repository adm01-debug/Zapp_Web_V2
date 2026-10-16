/**
 * Barrel de hooks do Copiloto de Vendas (RADAR) — Fases 7, 8 e 9.
 */

// Phase 7 — Ghost Text, Smart Templates, Voice, Attachments
export { useGhostText } from './useGhostText';
export type { UseGhostTextOptions, GhostTextState } from './useGhostText';

export { useSmartTemplates } from './useSmartTemplates';
export type { UseSmartTemplatesOptions, SmartTemplate } from './useSmartTemplates';

export { useVoiceDictation } from './useVoiceDictation';
export type { UseVoiceDictationOptions, VoiceDictationState } from './useVoiceDictation';

export { useAttachmentSuggestion } from './useAttachmentSuggestion';
export type { UseAttachmentSuggestionOptions, AttachmentSuggestion } from './useAttachmentSuggestion';

export { useCopilotFeedback } from './useCopilotFeedback';
export type { UseCopilotFeedbackOptions, FeedbackEntry } from './useCopilotFeedback';

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
