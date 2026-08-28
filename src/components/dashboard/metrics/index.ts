import { AnimatedMetricCard } from './AnimatedMetricCard';
import { TrendIndicator } from './TrendIndicator';
import { MiniSparkline } from './MiniSparkline';
import { MetricComparison } from './MetricComparison';
import { GoalProgressRing } from './GoalProgressRing';

export { AnimatedMetricCard, TrendIndicator, MiniSparkline, MetricComparison, GoalProgressRing };
export type { TrendDirection, MetricSize, MetricVariant } from './types';

export const DashboardMetrics = {
  Card: AnimatedMetricCard,
  Trend: TrendIndicator,
  Sparkline: MiniSparkline,
  Comparison: MetricComparison,
  GoalRing: GoalProgressRing,
};
