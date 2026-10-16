// CV-137–138: usePerformanceBenchmark — compare vendor metrics against team benchmarks

import type { CopilotMetrics } from './useCopilotAnalytics';

export interface BenchmarkResult {
  metric: string;
  vendorValue: number;
  teamAverage: number;
  percentile: number; // 0-100
  delta: number; // vendorValue - teamAverage
  trend: 'improving' | 'stable' | 'declining';
}

function computePercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 50;
  const below = allValues.filter((v) => v < value).length;
  return Math.round((below / allValues.length) * 100);
}

function computeTrend(
  vendorValue: number,
  teamAverage: number,
  higherIsBetter: boolean,
): BenchmarkResult['trend'] {
  const delta = vendorValue - teamAverage;
  const threshold = teamAverage * 0.05; // 5% buffer for 'stable'
  if (Math.abs(delta) <= threshold) return 'stable';
  if (higherIsBetter) return delta > 0 ? 'improving' : 'declining';
  return delta < 0 ? 'improving' : 'declining';
}

export function usePerformanceBenchmark(
  vendorMetrics: CopilotMetrics,
  teamMetrics: CopilotMetrics[],
): {
  benchmarks: BenchmarkResult[];
  overallScore: number;
} {
  const allAcceptance = teamMetrics.map((m) => m.acceptanceRate);
  const allEditDistance = teamMetrics.map((m) => m.avgEditDistance);
  const allFeatureCount = teamMetrics.map(
    (m) => m.topUsedFeatures.length,
  );

  const teamAvgAcceptance =
    allAcceptance.length > 0
      ? allAcceptance.reduce((a, b) => a + b, 0) / allAcceptance.length
      : 0;
  const teamAvgEditDistance =
    allEditDistance.length > 0
      ? allEditDistance.reduce((a, b) => a + b, 0) / allEditDistance.length
      : 0;
  const teamAvgFeatureCount =
    allFeatureCount.length > 0
      ? allFeatureCount.reduce((a, b) => a + b, 0) / allFeatureCount.length
      : 0;

  const benchmarks: BenchmarkResult[] = [
    {
      metric: 'acceptanceRate',
      vendorValue: vendorMetrics.acceptanceRate,
      teamAverage: teamAvgAcceptance,
      percentile: computePercentile(vendorMetrics.acceptanceRate, allAcceptance),
      delta: vendorMetrics.acceptanceRate - teamAvgAcceptance,
      trend: computeTrend(vendorMetrics.acceptanceRate, teamAvgAcceptance, true),
    },
    {
      metric: 'avgEditDistance',
      vendorValue: vendorMetrics.avgEditDistance,
      teamAverage: teamAvgEditDistance,
      percentile: computePercentile(
        vendorMetrics.avgEditDistance,
        allEditDistance,
      ),
      delta: vendorMetrics.avgEditDistance - teamAvgEditDistance,
      // Lower edit distance = better (less editing needed)
      trend: computeTrend(vendorMetrics.avgEditDistance, teamAvgEditDistance, false),
    },
    {
      metric: 'topUsedFeaturesCount',
      vendorValue: vendorMetrics.topUsedFeatures.length,
      teamAverage: teamAvgFeatureCount,
      percentile: computePercentile(
        vendorMetrics.topUsedFeatures.length,
        allFeatureCount,
      ),
      delta: vendorMetrics.topUsedFeatures.length - teamAvgFeatureCount,
      trend: computeTrend(
        vendorMetrics.topUsedFeatures.length,
        teamAvgFeatureCount,
        true,
      ),
    },
  ];

  // overallScore: weighted average (acceptance 40%, editDistance 30%, featureCount 30%)
  // Normalize each to 0-1: acceptance already 0-1; editDistance inverted (1 - normalized);
  // featureCount normalized by max possible (10 features)
  const MAX_FEATURES = 10;
  const acceptanceScore = vendorMetrics.acceptanceRate; // 0-1
  const editDistanceScore = Math.max(
    0,
    1 - vendorMetrics.avgEditDistance,
  ); // lower = better
  const featureScore = Math.min(
    vendorMetrics.topUsedFeatures.length / MAX_FEATURES,
    1,
  );

  const overallScore =
    acceptanceScore * 0.4 + editDistanceScore * 0.3 + featureScore * 0.3;

  return { benchmarks, overallScore };
}
