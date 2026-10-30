/**
 * Barrel de componentes do Copiloto de Vendas (RADAR) — Fases 7–13.
 */
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

// CV-093 — alerta de velocidade de resposta
export { SpeedToLeadAlert } from './SpeedToLeadAlert';
export type { SpeedToLeadAlertProps, AlertLevel } from './SpeedToLeadAlert';

// CV-118 — label de transparência de IA
export { TransparencyLabel } from './TransparencyLabel';
export type { TransparencyLabelProps, TransparencyLabelVariant } from './TransparencyLabel';

// CV-071-080 — Fase 8: objeções
export { RadarPhase8Panel } from './RadarPhase8Panel';
export type { RadarPhase8PanelProps } from './RadarPhase8Panel';
export { ObjectionCard } from './ObjectionCard';
export type { ObjectionCardProps } from './ObjectionCard';
export { ObjectionHandlerCard } from './ObjectionHandlerCard';
export { DiscountGuardrailBanner } from './DiscountGuardrailBanner';

// CV-081-090 — Fase 9: catálogo, prazo, orçamento
export { RadarPhase9Panel } from './RadarPhase9Panel';
export type { RadarPhase9PanelProps } from './RadarPhase9Panel';
export { DeadlineCalcCard } from './DeadlineCalcCard';

// CV-091-100 — Fase 10: lead, follow-up, silêncio
export { RadarPhase10Panel } from './RadarPhase10Panel';
export type { RadarPhase10PanelProps } from './RadarPhase10Panel';

// CV-071-150 — Painel integrado fases 8-15
export { RadarPhase8to15Panel } from './RadarPhase8to15Panel';

// CV-086 — rascunho de proposta
export { QuoteDraftCard } from './QuoteDraftCard';

// CV-088 — upsell
export { UpsellCard } from './UpsellCard';

// CV-091 — termômetro de lead
export { LeadThermometerBadge } from './LeadThermometerBadge';

// CV-092 — sinais de compra
export { PurchaseSignalAlert } from './PurchaseSignalAlert';

// CV-122 — coaching tip
export { CoachingTipBanner } from './CoachingTipBanner';
