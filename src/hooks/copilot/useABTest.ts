// CV-135–136: useABTest — simple A/B test framework for copilot features

export interface ABVariant {
  name: string;
  description: string;
  isActive: boolean;
}

export interface ABTestConfig {
  testId: string;
  variants: Record<string, ABVariant>;
  activeVariant: string;
}

// Simple stable hash: sum of char codes
function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0; // keep 32-bit unsigned
  }
  return h;
}

// Exposure tracking (module-level, session only)
const exposures: Record<string, number> = {};

export function useABTest(
  testId: string,
  variants: string[],
  vendorId = 'default',
): {
  activeVariant: string;
  isVariant: (v: string) => boolean;
  recordExposure: () => void;
} {
  if (variants.length === 0) {
    throw new Error('useABTest: variants must not be empty');
  }

  // Stable assignment: hash(vendorId + testId) % variants.length
  const idx = stableHash(vendorId + testId) % variants.length;
  const activeVariant = variants[idx];

  function isVariant(v: string): boolean {
    return activeVariant === v;
  }

  function recordExposure(): void {
    const key = `${testId}:${activeVariant}`;
    exposures[key] = (exposures[key] ?? 0) + 1;
  }

  return { activeVariant, isVariant, recordExposure };
}
