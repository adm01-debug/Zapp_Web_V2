/**
 * Semantic wrapper around the canonical MiniSparkline in ./metrics/MiniSparkline.
 *
 * This file exists for call sites that use the `isPositive` API (binary
 * color intent) instead of an explicit color. It translates the semantic
 * prop to the canonical component's `color` prop.
 *
 * Migration path:
 *   Before: import { MiniSparkline } from '@/components/dashboard/MiniSparkline'
 *   After:  import { MiniSparkline } from '@/components/dashboard/metrics/MiniSparkline'
 *           (pass color='hsl(var(--success))' or 'hsl(var(--destructive))' explicitly)
 */
import { MiniSparkline as MetricsMiniSparkline } from './metrics/MiniSparkline';

interface MiniSparklineProps {
  data: number[];
  /** Whether the trend is positive (green) or negative (red) */
  isPositive: boolean;
  /** @deprecated Has no effect — canonical component controls its own animation timing */
  delay?: number;
}

/** @deprecated Use MiniSparkline from './metrics/MiniSparkline' directly. */
export function MiniSparkline({ data, isPositive }: MiniSparklineProps) {
  const color = isPositive
    ? 'hsl(var(--success))'
    : 'hsl(var(--destructive))';

  return <MetricsMiniSparkline data={data} color={color} height={20} />;
}
