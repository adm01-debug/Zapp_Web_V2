// CV-131–132: useCopilotAnalytics — track copilot usage metrics per session

export interface CopilotMetrics {
  sessionsWithCopilot: number;
  totalSuggestions: number;
  acceptedSuggestions: number;
  editedSuggestions: number;
  rejectedSuggestions: number;
  acceptanceRate: number; // 0-1
  avgEditDistance: number; // Levenshtein normalized
  topUsedFeatures: Array<{ feature: string; count: number }>;
}

export interface CopilotEvent {
  type:
    | 'suggestion_shown'
    | 'suggestion_accepted'
    | 'suggestion_edited'
    | 'suggestion_rejected'
    | 'feature_used';
  feature?: string;
  editDistance?: number;
  timestamp: string;
}

const DEFAULT_METRICS: CopilotMetrics = {
  sessionsWithCopilot: 0,
  totalSuggestions: 0,
  acceptedSuggestions: 0,
  editedSuggestions: 0,
  rejectedSuggestions: 0,
  acceptanceRate: 0,
  avgEditDistance: 0,
  topUsedFeatures: [],
};

// Module-level store (session only, not persisted)
let events: CopilotEvent[] = [];
let sessionActive = false;

function computeMetrics(evts: CopilotEvent[]): CopilotMetrics {
  const totalSuggestions = evts.filter(
    (e) => e.type === 'suggestion_shown',
  ).length;
  const acceptedSuggestions = evts.filter(
    (e) => e.type === 'suggestion_accepted',
  ).length;
  const editedSuggestions = evts.filter(
    (e) => e.type === 'suggestion_edited',
  ).length;
  const rejectedSuggestions = evts.filter(
    (e) => e.type === 'suggestion_rejected',
  ).length;

  const acceptanceRate =
    totalSuggestions > 0 ? acceptedSuggestions / totalSuggestions : 0;

  const editDistances = evts
    .filter((e) => e.type === 'suggestion_edited' && e.editDistance != null)
    .map((e) => e.editDistance as number);
  const avgEditDistance =
    editDistances.length > 0
      ? editDistances.reduce((a, b) => a + b, 0) / editDistances.length
      : 0;

  // Count feature usage
  const featureCounts: Record<string, number> = {};
  for (const e of evts) {
    if (e.type === 'feature_used' && e.feature) {
      featureCounts[e.feature] = (featureCounts[e.feature] ?? 0) + 1;
    }
  }
  const topUsedFeatures = Object.entries(featureCounts)
    .map(([feature, count]) => ({ feature, count }))
    .sort((a, b) => b.count - a.count);

  return {
    sessionsWithCopilot: sessionActive ? 1 : 0,
    totalSuggestions,
    acceptedSuggestions,
    editedSuggestions,
    rejectedSuggestions,
    acceptanceRate,
    avgEditDistance,
    topUsedFeatures,
  };
}

export function useCopilotAnalytics(): {
  metrics: CopilotMetrics;
  track: (event: CopilotEvent) => void;
  reset: () => void;
} {
  function track(event: CopilotEvent): void {
    if (
      event.type === 'suggestion_shown' ||
      event.type === 'feature_used'
    ) {
      sessionActive = true;
    }
    events = [...events, event];
  }

  function reset(): void {
    events = [];
    sessionActive = false;
  }

  const metrics = computeMetrics(events);

  return { metrics, track, reset };
}
