/**
 * CV-141–142: useRadarOrchestrator — master hook that composes ALL RADAR state
 * into a single unified interface.
 */

export interface RadarOrchestratorState {
  // Phase 7 — Ghost Text
  ghostTextEnabled: boolean;
  // Phase 8 — Objections / Loss Risk
  hasActiveObjection: boolean;
  lossRiskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  // Phase 9 — Products / Quote
  hasProductRecommendation: boolean;
  hasQuoteDraft: boolean;
  // Phase 10 — Lead Signals
  leadTemperature: number; // 0–100
  speedToLeadAlertLevel: 'none' | 'yellow' | 'orange' | 'red';
  // Phase 11 — Multimodal
  multimodalPrimaryAction: string | null;
  // Phase 12 — Privacy / Guardrails
  hasPrivacyViolation: boolean;
  // Phase 13 — Supervisor / Coaching
  supervisorAlertCount: number;
  // Phase 14 — Analytics
  copilotAcceptanceRate: number;
  // Meta
  activeFeatureCount: number;
  overallRadarScore: number; // 0–100 composite indicator
}

const DEFAULTS: RadarOrchestratorState = {
  ghostTextEnabled: true,
  hasActiveObjection: false,
  lossRiskLevel: 'none',
  hasProductRecommendation: false,
  hasQuoteDraft: false,
  leadTemperature: 50,
  speedToLeadAlertLevel: 'none',
  multimodalPrimaryAction: null,
  hasPrivacyViolation: false,
  supervisorAlertCount: 0,
  copilotAcceptanceRate: 0,
  activeFeatureCount: 0,
  overallRadarScore: 50,
};

function computeActiveFeatureCount(s: Omit<RadarOrchestratorState, 'activeFeatureCount' | 'overallRadarScore'>): number {
  let count = 0;
  if (s.ghostTextEnabled) count++;
  if (s.hasActiveObjection) count++;
  if (s.lossRiskLevel !== 'none') count++;
  if (s.hasProductRecommendation) count++;
  if (s.hasQuoteDraft) count++;
  if (s.speedToLeadAlertLevel !== 'none') count++;
  if (s.multimodalPrimaryAction !== null) count++;
  if (s.hasPrivacyViolation) count++;
  if (s.supervisorAlertCount > 0) count++;
  return count;
}

function computeOverallRadarScore(s: Omit<RadarOrchestratorState, 'activeFeatureCount' | 'overallRadarScore'>): number {
  const lossRiskPenalty = s.lossRiskLevel !== 'none' ? -20 : 0;
  const objectionPenalty = s.hasActiveObjection ? -10 : 0;
  const acceptanceBonus = s.copilotAcceptanceRate * 20;

  const score = s.leadTemperature * 0.3 + lossRiskPenalty + objectionPenalty + acceptanceBonus;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Merges partial RADAR state with defaults and computes derived metrics.
 * This hook is intentionally stateless — it derives its output from the
 * partial state you pass in, so it can be composed above the individual hooks.
 */
export function useRadarOrchestrator(
  partialState: Partial<RadarOrchestratorState> = {}
): RadarOrchestratorState {
  const merged = { ...DEFAULTS, ...partialState };

  const base: Omit<RadarOrchestratorState, 'activeFeatureCount' | 'overallRadarScore'> = {
    ghostTextEnabled: merged.ghostTextEnabled,
    hasActiveObjection: merged.hasActiveObjection,
    lossRiskLevel: merged.lossRiskLevel,
    hasProductRecommendation: merged.hasProductRecommendation,
    hasQuoteDraft: merged.hasQuoteDraft,
    leadTemperature: merged.leadTemperature,
    speedToLeadAlertLevel: merged.speedToLeadAlertLevel,
    multimodalPrimaryAction: merged.multimodalPrimaryAction,
    hasPrivacyViolation: merged.hasPrivacyViolation,
    supervisorAlertCount: merged.supervisorAlertCount,
    copilotAcceptanceRate: merged.copilotAcceptanceRate,
  };

  return {
    ...base,
    activeFeatureCount: computeActiveFeatureCount(base),
    overallRadarScore: computeOverallRadarScore(base),
  };
}
