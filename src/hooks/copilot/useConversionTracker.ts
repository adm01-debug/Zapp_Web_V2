// CV-133–134: useConversionTracker — track conversation outcomes for copilot ROI

export interface ConversionEvent {
  conversationId: string;
  outcome: 'converted' | 'lost' | 'in_progress';
  copilotAssisted: boolean; // was copilot active during this conversation?
  timeToClose: number | null; // minutes
  dealValue: number | null;
  stage: 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6'; // B·R·I·N·D·E stages
}

export interface ConversionStats {
  conversionRateWithCopilot: number;
  conversionRateWithout: number;
  avgTimeToCloseWithCopilot: number;
  avgTimeToCloseWithout: number;
  liftPercentage: number; // ((with - without) / without) * 100
}

const DEFAULT_STATS: ConversionStats = {
  conversionRateWithCopilot: 0,
  conversionRateWithout: 0,
  avgTimeToCloseWithCopilot: 0,
  avgTimeToCloseWithout: 0,
  liftPercentage: 0,
};

// Module-level in-memory store
let conversionEvents: ConversionEvent[] = [];

function computeStats(evts: ConversionEvent[]): ConversionStats {
  const withCopilot = evts.filter((e) => e.copilotAssisted);
  const withoutCopilot = evts.filter((e) => !e.copilotAssisted);

  const convertedWith = withCopilot.filter(
    (e) => e.outcome === 'converted',
  ).length;
  const convertedWithout = withoutCopilot.filter(
    (e) => e.outcome === 'converted',
  ).length;

  const conversionRateWithCopilot =
    withCopilot.length > 0 ? convertedWith / withCopilot.length : 0;
  const conversionRateWithout =
    withoutCopilot.length > 0 ? convertedWithout / withoutCopilot.length : 0;

  const timesWithCopilot = withCopilot
    .filter((e) => e.timeToClose != null)
    .map((e) => e.timeToClose as number);
  const timesWithout = withoutCopilot
    .filter((e) => e.timeToClose != null)
    .map((e) => e.timeToClose as number);

  const avgTimeToCloseWithCopilot =
    timesWithCopilot.length > 0
      ? timesWithCopilot.reduce((a, b) => a + b, 0) / timesWithCopilot.length
      : 0;
  const avgTimeToCloseWithout =
    timesWithout.length > 0
      ? timesWithout.reduce((a, b) => a + b, 0) / timesWithout.length
      : 0;

  const liftPercentage =
    conversionRateWithout > 0
      ? ((conversionRateWithCopilot - conversionRateWithout) /
          conversionRateWithout) *
        100
      : 0;

  return {
    conversionRateWithCopilot,
    conversionRateWithout,
    avgTimeToCloseWithCopilot,
    avgTimeToCloseWithout,
    liftPercentage,
  };
}

export function useConversionTracker(): {
  stats: ConversionStats;
  recordConversion: (event: ConversionEvent) => void;
} {
  function recordConversion(event: ConversionEvent): void {
    conversionEvents = [...conversionEvents, event];
  }

  const stats = computeStats(conversionEvents);

  return { stats, recordConversion };
}
