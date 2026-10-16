// Tests for CV-131–138: useCopilotAnalytics, useConversionTracker, useABTest

import { describe, it, expect, beforeEach } from 'vitest';

// We call the hooks directly (they use module-level state, so we import fresh)
// Use dynamic import workarounds — simpler: just test the pure logic directly

describe('useCopilotAnalytics', () => {
  // Import fresh module state by re-importing — in vitest we can use resetModules
  it('track() increments totalSuggestions', async () => {
    const { useCopilotAnalytics } = await import('../useCopilotAnalytics');
    const { track, reset } = useCopilotAnalytics();

    reset(); // clear any prior state
    track({
      type: 'suggestion_shown',
      timestamp: new Date().toISOString(),
    });
    track({
      type: 'suggestion_shown',
      timestamp: new Date().toISOString(),
    });

    const { metrics } = useCopilotAnalytics();
    expect(metrics.totalSuggestions).toBe(2);

    reset();
  });

  it('acceptanceRate computed correctly', async () => {
    const { useCopilotAnalytics } = await import('../useCopilotAnalytics');
    const { track, reset } = useCopilotAnalytics();

    reset();
    track({ type: 'suggestion_shown', timestamp: new Date().toISOString() });
    track({ type: 'suggestion_shown', timestamp: new Date().toISOString() });
    track({ type: 'suggestion_shown', timestamp: new Date().toISOString() });
    track({ type: 'suggestion_shown', timestamp: new Date().toISOString() });
    track({
      type: 'suggestion_accepted',
      timestamp: new Date().toISOString(),
    });
    track({
      type: 'suggestion_accepted',
      timestamp: new Date().toISOString(),
    });

    const { metrics } = useCopilotAnalytics();
    // 2 accepted / 4 shown = 0.5
    expect(metrics.acceptanceRate).toBeCloseTo(0.5);

    reset();
  });
});

describe('useConversionTracker', () => {
  it('liftPercentage = 0 when no data', async () => {
    // Bypass module-level state by reading fresh
    const mod = await import('../useConversionTracker');
    // Reset module state indirectly — create stats from empty store
    // Since the hook uses module-level state, test after fresh import
    const { stats } = mod.useConversionTracker();
    // No data means liftPercentage should be 0
    expect(stats.liftPercentage).toBe(0);
  });
});

describe('useABTest', () => {
  it('stable assignment: same vendor always gets same variant', async () => {
    const { useABTest } = await import('../useABTest');
    const vendorId = 'vendor-abc-123';
    const testId = 'copilot-prompt-format';
    const variants = ['control', 'treatment-a', 'treatment-b'];

    const result1 = useABTest(testId, variants, vendorId);
    const result2 = useABTest(testId, variants, vendorId);
    const result3 = useABTest(testId, variants, vendorId);

    expect(result1.activeVariant).toBe(result2.activeVariant);
    expect(result2.activeVariant).toBe(result3.activeVariant);
    expect(variants).toContain(result1.activeVariant);
  });

  it('isVariant returns true only for the active variant', async () => {
    const { useABTest } = await import('../useABTest');
    const vendorId = 'vendor-xyz';
    const testId = 'feature-test';
    const variants = ['control', 'variant-b'];

    const { activeVariant, isVariant } = useABTest(testId, variants, vendorId);

    expect(isVariant(activeVariant)).toBe(true);
    const other = variants.find((v) => v !== activeVariant)!;
    expect(isVariant(other)).toBe(false);
  });
});
