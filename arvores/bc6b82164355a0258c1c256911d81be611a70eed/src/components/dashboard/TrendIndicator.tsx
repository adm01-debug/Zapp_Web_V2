/**
 * TrendIndicator — canonical, standalone trend display.
 *
 * This is the FULL-FEATURED version. It exports:
 *   - calculateTrend(current, previous)  ← pure utility
 *   - TrendIndicator  ← takes raw `current` + `previous` numbers
 *   - CompactTrendBadge  ← circular icon-only badge
 *   - TrendSparkline  ← animated line chart
 *   - TrendData interface
 *
 * ─── vs. dashboard/metrics/TrendIndicator ─────────────────────────────────
 * The metrics/ version is a lightweight sub-module component that accepts a
 * pre-computed `direction: TrendDirection` (from `./types`) and is designed
 * exclusively for use inside the metrics/ folder. Do NOT use it outside that
 * module — the API is intentionally different.
 * ──────────────────────────────────────────────────────────────────────────
 */
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TrendData {
  value: number;
  previousValue: number;
  label?: string;
  invertColors?: boolean; // For metrics where lower is better (e.g., response time)
}

interface TrendIndicatorProps {
  current: number;
  previous: number;
  suffix?: string;
  label?: string;
  invertColors?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showAbsoluteChange?: boolean;
  animated?: boolean;
}

export function calculateTrend(current: number, previous: number): {
  percentage: number;
  direction: 'up' | 'down' | 'neutral';
  absoluteChange: number;
} {
  if (previous === 0) {
    return {
      percentage: current > 0 ? 100 : 0,
      direction: current > 0 ? 'up' : 'neutral',
      absoluteChange: current,
    };
  }

  const absoluteChange = current - previous;
  const percentage = ((current - previous) / previous) * 100;

  return {
    percentage: Math.abs(percentage),
    direction: percentage > 0.5 ? 'up' : percentage < -0.5 ? 'down' : 'neutral',
    absoluteChange,
  };
}

const sizeConfig = {
  sm: {
    container: 'px-2 py-0.5 gap-1',
    icon: 'w-3 h-3',
    text: 'text-xs',
    arrow: 'w-3 h-3',
  },
  md: {
    container: 'px-2.5 py-1 gap-1.5',
    icon: 'w-3.5 h-3.5',
    text: 'text-xs',
    arrow: 'w-4 h-4',
  },
  lg: {
    container: 'px-3 py-1.5 gap-2',
    icon: 'w-4 h-4',
    text: 'text-sm',
    arrow: 'w-5 h-5',
  },
};

export function TrendIndicator({
  current,
  previous,
  suffix = '%',
  label = 'vs período anterior',
  invertColors = false,
  size = 'md',
  showAbsoluteChange = false,
  animated = true,
}: TrendIndicatorProps) {
  const { percentage, direction, absoluteChange } = calculateTrend(current, previous);
  const sizes = sizeConfig[size];

  const isPositive = invertColors ? direction === 'down' : direction === 'up';
  const isNegative = invertColors ? direction === 'up' : direction === 'down';

  const colorClasses = {
    positive: 'bg-success/15 text-success border-success/30',
    negative: 'bg-destructive/15 text-destructive border-destructive/30',
    neutral: 'bg-muted/50 text-muted-foreground border-border/30',
  };

  const colorClass = isPositive ? colorClasses.positive : isNegative ? colorClasses.negative : colorClasses.neutral;

  const TrendIcon = direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
  const ArrowIcon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : null;

  const displayValue = showAbsoluteChange 
    ? `${absoluteChange > 0 ? '+' : ''}${absoluteChange.toFixed(0)}` 
    : `${percentage.toFixed(1)}${suffix}`;

  return (
    <div className="flex items-center gap-2">
      <motion.div
        initial={{ opacity: 0, x: -10, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
        whileHover={{ scale: 1.05 }}
        className={cn(
          "inline-flex items-center rounded-full border font-semibold transition-all duration-300",
          colorClass,
          sizes.container
        )}
      >
        {ArrowIcon && animated ? (
          <motion.div
            animate={direction === 'up' 
              ? { y: [0, -2, 0] }
              : { y: [0, 2, 0] }
            }
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ArrowIcon className={sizes.arrow} />
          </motion.div>
        ) : ArrowIcon ? (
          <ArrowIcon className={sizes.arrow} />
        ) : (
          <Minus className={sizes.arrow} />
        )}

        <span className={sizes.text}>{displayValue}</span>
      </motion.div>

      {label && (
        <span className={cn("text-muted-foreground", sizes.text)}>
          {label}
        </span>
      )}
    </div>
  );
}

interface CompactTrendBadgeProps {
  percentage: number;
  invertColors?: boolean;
  size?: 'sm' | 'md';
}

export function CompactTrendBadge({
  percentage,
  invertColors = false,
  size = 'sm',
}: CompactTrendBadgeProps) {
  const direction = percentage > 0.5 ? 'up' : percentage < -0.5 ? 'down' : 'neutral';
  const isPositive = invertColors ? direction === 'down' : direction === 'up';
  const isNegative = invertColors ? direction === 'up' : direction === 'down';

  const ArrowIcon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : null;

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        size === 'sm' ? 'w-6 h-6' : 'w-8 h-8',
        isPositive && 'bg-success/20 text-success',
        isNegative && 'bg-destructive/20 text-destructive',
        !isPositive && !isNegative && 'bg-muted text-muted-foreground'
      )}
    >
      {ArrowIcon ? (
        <motion.div
          animate={direction === 'up' 
            ? { y: [0, -1, 0] }
            : { y: [0, 1, 0] }
          }
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <ArrowIcon className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </motion.div>
      ) : (
        <Minus className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
      )}
    </motion.div>
  );
}

interface TrendSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  showDots?: boolean;
}

export function TrendSparkline({
  data,
  width = 80,
  height = 24,
  className,
  showDots = false,
}: TrendSparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return { x, y, value };
  });

  const pathD = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  const isPositive = data[data.length - 1] >= data[0];

  return (
    <motion.svg
      width={width}
      height={height}
      className={cn("overflow-visible", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <defs>
        <linearGradient id={`sparkline-gradient-${isPositive ? 'up' : 'down'}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} stopOpacity="0" />
        </linearGradient>
      </defs>

      <motion.path
        d={`${pathD} L ${width} ${height} L 0 ${height} Z`}
        fill={`url(#sparkline-gradient-${isPositive ? 'up' : 'down'})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      />

      <motion.path
        d={pathD}
        fill="none"
        stroke={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />

      {showDots && points.length > 0 && (
        <motion.circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="3"
          fill={isPositive ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.3, delay: 0.6 }}
        />
      )}
    </motion.svg>
  );
}
