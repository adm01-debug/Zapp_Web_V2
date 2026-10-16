/**
 * Barrel de componentes do Copiloto de Vendas (RADAR) — Fases 7–15.
 */

// Phase 7 — Ghost Text, Feedback, Templates, Attachments, Voice, Panel
export { GhostTextOverlay, GhostTextHint } from './GhostTextOverlay';
export { CopilotFeedback } from './CopilotFeedback';
export type { CopilotFeedbackProps } from './CopilotFeedback';
export { AttachmentSuggestionBanner } from './AttachmentSuggestion';
export type { AttachmentSuggestionBannerProps } from './AttachmentSuggestion';
export { SmartTemplates } from './SmartTemplates';
export type { SmartTemplatesProps } from './SmartTemplates';
export { VoiceDictationButton } from './VoiceDictation';
export type { VoiceDictationButtonProps } from './VoiceDictation';
export { RadarPhase7Panel } from './RadarPhase7Panel';
export type { RadarPhase7PanelProps } from './RadarPhase7Panel';

// Phase 8 — Objections, Competitors, Price
export { ObjectionCard } from './ObjectionCard';
export type { ObjectionCardProps } from './ObjectionCard';
export { BattlecardPanel } from './BattlecardPanel';
export type { BattlecardPanelProps } from './BattlecardPanel';
export { DiscountGuardrail } from './DiscountGuardrail';
export type { DiscountGuardrailProps } from './DiscountGuardrail';
export { LossRiskAlert } from './LossRiskAlert';
export type { LossRiskAlertProps } from './LossRiskAlert';

// Phase 9 — Catalog, Budget, Timeline
export { ProductRecommendationCard } from './ProductRecommendationCard';
export type { ProductRecommendationCardProps } from './ProductRecommendationCard';
export { DeadlinePanel } from './DeadlinePanel';
export type { DeadlinePanelProps } from './DeadlinePanel';
export { QuoteDraftCard } from './QuoteDraftCard';
export type { QuoteDraftCardProps } from './QuoteDraftCard';

// Phase 10 — Lead Signals
export { LeadThermometer } from './LeadThermometer';
export type { LeadThermometerProps } from './LeadThermometer';
export { SpeedToLeadBadge } from './SpeedToLeadBadge';
export type { SpeedToLeadBadgeProps } from './SpeedToLeadBadge';
export { SilenceAlert } from './SilenceAlert';
export type { SilenceAlertProps } from './SilenceAlert';

// Phase 11 — Multimodal
export { MultimodalInsightCard } from './MultimodalInsightCard';
export type { MultimodalInsightCardProps } from './MultimodalInsightCard';

// Phase 12 — Guardrails
export * from './GuardrailBadge';

// Phase 13 — Supervisor, Coaching
export * from './SupervisorPanel';
export * from './CoachingToast';

// Phase 14 — Analytics
export { AnalyticsDashboard } from './AnalyticsDashboard';
export type { AnalyticsDashboardProps } from './AnalyticsDashboard';

// Phase 15 — Master Panel, Help Overlay
export { RadarMasterPanel } from './RadarMasterPanel';
export type { RadarMasterPanelProps } from './RadarMasterPanel';

export { RadarHelpOverlay } from './RadarHelpOverlay';
export type { RadarHelpOverlayProps } from './RadarHelpOverlay';
