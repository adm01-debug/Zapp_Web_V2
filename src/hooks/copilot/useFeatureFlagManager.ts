import { useState, useCallback } from 'react';

export interface RADARFeatureFlags {
  ghostText: boolean;
  smartTemplates: boolean;
  voiceDictation: boolean;
  objectionDetector: boolean;
  battlecard: boolean;
  priceAnchor: boolean;
  productRecommendation: boolean;
  reverseDeadline: boolean;
  quoteDraft: boolean;
  leadThermometer: boolean;
  buySignalDetector: boolean;
  speedToLead: boolean;
  followUpCard: boolean;
  audioToneIndicator: boolean;
  logoAnalysis: boolean;
  competitorQuote: boolean;
  factChecker: boolean;
  prohibitedPromises: boolean;
  promptInjectionGuard: boolean;
  sensitiveDataMasker: boolean;
  supervisorWhisper: boolean;
  rolePlaySimulator: boolean;
  weeklyReport: boolean;
  predictiveLeadScore: boolean;
  continuousImprovement: boolean;
}

export interface UseFeatureFlagManagerOptions {
  initialFlags?: Partial<RADARFeatureFlags>;
  onFlagChange?: (flag: keyof RADARFeatureFlags, value: boolean) => void;
}

export interface FeatureFlagManagerResult {
  flags: RADARFeatureFlags;
  isEnabled: (flag: keyof RADARFeatureFlags) => boolean;
  enable: (flag: keyof RADARFeatureFlags) => void;
  disable: (flag: keyof RADARFeatureFlags) => void;
  toggle: (flag: keyof RADARFeatureFlags) => void;
  enableAll: () => void;
  disableAll: () => void;
  reset: () => void;
}

const DEFAULT_FLAGS: RADARFeatureFlags = {
  ghostText: true,
  smartTemplates: true,
  voiceDictation: true,
  objectionDetector: true,
  battlecard: true,
  priceAnchor: true,
  productRecommendation: true,
  reverseDeadline: true,
  quoteDraft: true,
  leadThermometer: true,
  buySignalDetector: true,
  speedToLead: true,
  followUpCard: true,
  audioToneIndicator: false,
  logoAnalysis: false,
  competitorQuote: false,
  factChecker: true,
  prohibitedPromises: true,
  promptInjectionGuard: true,
  sensitiveDataMasker: true,
  supervisorWhisper: false,
  rolePlaySimulator: false,
  weeklyReport: true,
  predictiveLeadScore: false,
  continuousImprovement: false,
};

/**
 * CV-143 — Gerenciador de feature flags do RADAR.
 * Controls which RADAR features are active for a given pilot cohort or user.
 */
export function useFeatureFlagManager({
  initialFlags,
  onFlagChange,
}: UseFeatureFlagManagerOptions = {}): FeatureFlagManagerResult {
  const [flags, setFlags] = useState<RADARFeatureFlags>({
    ...DEFAULT_FLAGS,
    ...initialFlags,
  });

  const isEnabled = useCallback(
    (flag: keyof RADARFeatureFlags) => flags[flag],
    [flags],
  );

  const enable = useCallback(
    (flag: keyof RADARFeatureFlags) => {
      setFlags(prev => ({ ...prev, [flag]: true }));
      onFlagChange?.(flag, true);
    },
    [onFlagChange],
  );

  const disable = useCallback(
    (flag: keyof RADARFeatureFlags) => {
      setFlags(prev => ({ ...prev, [flag]: false }));
      onFlagChange?.(flag, false);
    },
    [onFlagChange],
  );

  const toggle = useCallback(
    (flag: keyof RADARFeatureFlags) => {
      setFlags(prev => {
        const next = !prev[flag];
        onFlagChange?.(flag, next);
        return { ...prev, [flag]: next };
      });
    },
    [onFlagChange],
  );

  const enableAll = useCallback(() => {
    const all = Object.fromEntries(
      Object.keys(DEFAULT_FLAGS).map(k => [k, true]),
    ) as RADARFeatureFlags;
    setFlags(all);
  }, []);

  const disableAll = useCallback(() => {
    const none = Object.fromEntries(
      Object.keys(DEFAULT_FLAGS).map(k => [k, false]),
    ) as RADARFeatureFlags;
    setFlags(none);
  }, []);

  const reset = useCallback(() => {
    setFlags({ ...DEFAULT_FLAGS, ...initialFlags });
  }, [initialFlags]);

  return { flags, isEnabled, enable, disable, toggle, enableAll, disableAll, reset };
}
