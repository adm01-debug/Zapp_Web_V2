/**
 * Unified Chart Color System
 * 
 * Centralized color palette for all charts in the application.
 * Uses CSS variables for automatic light/dark theme support.
 */

// ===== COLOR PALETTE =====
// These map to CSS variables defined in index.css

export const CHART_COLORS = {
  // Primary palette (10 colors for general use)
  primary: 'hsl(var(--chart-1))',
  secondary: 'hsl(var(--chart-2))',
  tertiary: 'hsl(var(--chart-3))',
  quaternary: 'hsl(var(--chart-4))',
  quinary: 'hsl(var(--chart-5))',
  senary: 'hsl(var(--chart-6))',
  septenary: 'hsl(var(--chart-7))',
  octonary: 'hsl(var(--chart-8))',
  nonary: 'hsl(var(--chart-9))',
  denary: 'hsl(var(--chart-10))',
  
  // Semantic colors
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  danger: 'hsl(var(--destructive))',
  info: 'hsl(var(--info))',
  
  // Status colors
  resolved: 'hsl(var(--chart-status-resolved))',
  pending: 'hsl(var(--chart-status-pending))',
  waiting: 'hsl(var(--chart-status-waiting))',
  open: 'hsl(var(--chart-status-open))',
  
  // Sentiment colors
  positive: 'hsl(var(--chart-sentiment-positive))',
  neutral: 'hsl(var(--chart-sentiment-neutral))',
  negative: 'hsl(var(--chart-sentiment-negative))',
  
  // Muted/background
  muted: 'hsl(var(--muted))',
  mutedForeground: 'hsl(var(--muted-foreground))',
} as const;

// ===== COLOR ARRAYS =====
// Pre-built arrays for easy use in charts

export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.tertiary,
  CHART_COLORS.quaternary,
  CHART_COLORS.quinary,
  CHART_COLORS.senary,
  CHART_COLORS.septenary,
  CHART_COLORS.octonary,
  CHART_COLORS.nonary,
  CHART_COLORS.denary,
] as const;

export const CHART_PALETTE_MINI = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.tertiary,
  CHART_COLORS.quaternary,
  CHART_COLORS.quinary,
] as const;

export const STATUS_PALETTE = [
  CHART_COLORS.resolved,
  CHART_COLORS.pending,
  CHART_COLORS.waiting,
  CHART_COLORS.open,
] as const;

export const SENTIMENT_PALETTE = [
  CHART_COLORS.positive,
  CHART_COLORS.neutral,
  CHART_COLORS.negative,
] as const;

// ===== GRADIENT DEFINITIONS =====

export const CHART_GRADIENTS = {
  primary: {
    id: 'chartGradientPrimary',
    colors: ['hsl(var(--chart-1))', 'hsl(var(--chart-1) / 0.3)'],
  },
  secondary: {
    id: 'chartGradientSecondary', 
    colors: ['hsl(var(--chart-2))', 'hsl(var(--chart-2) / 0.3)'],
  },
  success: {
    id: 'chartGradientSuccess',
    colors: ['hsl(var(--success))', 'hsl(var(--success) / 0.3)'],
  },
  warning: {
    id: 'chartGradientWarning',
    colors: ['hsl(var(--warning))', 'hsl(var(--warning) / 0.3)'],
  },
  danger: {
    id: 'chartGradientDanger',
    colors: ['hsl(var(--destructive))', 'hsl(var(--destructive) / 0.3)'],
  },
} as const;

// ===== UTILITY FUNCTIONS =====

/**
 * Get a color from the palette by index (wraps around)
 */
export function getChartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

/**
 * Get multiple colors from the palette
 */
export function getChartColors(count: number): string[] {
  return Array.from({ length: count }, (_, i) => getChartColor(i));
}

/**
 * Get color with custom opacity
 */
export function getChartColorWithOpacity(index: number, opacity: number): string {
  const baseColor = CHART_PALETTE[index % CHART_PALETTE.length];
  // Replace closing paren with opacity
  return baseColor.replace(')', ` / ${opacity})`);
}

/**
 * Generate a color config for recharts ChartContainer
 */
export function generateChartConfig(
  keys: string[], 
  labels?: Record<string, string>
): Record<string, { label: string; color: string }> {
  return keys.reduce((acc, key, index) => {
    acc[key] = {
      label: labels?.[key] || key,
      color: getChartColor(index),
    };
    return acc;
  }, {} as Record<string, { label: string; color: string }>);
}

/**
 * Get gradient URL reference for use in charts
 */
export function getGradientUrl(key: ChartGradientKey): string {
  return `url(#${CHART_GRADIENTS[key].id})`;
}

// ===== CHART STYLE PRESETS =====

export const CHART_STYLES = {
  // Axis styling
  axis: {
    stroke: 'hsl(var(--border))',
    tickLine: false,
    axisLine: false,
    fontSize: 12,
    tickMargin: 8,
  },
  
  // Grid styling
  grid: {
    strokeDasharray: '3 3',
    stroke: 'hsl(var(--border) / 0.5)',
    vertical: false,
  },
  
  // Tooltip styling
  tooltip: {
    cursor: { fill: 'hsl(var(--muted) / 0.3)' },
    contentStyle: {
      backgroundColor: 'hsl(var(--popover))',
      borderColor: 'hsl(var(--border))',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow-lg)',
    },
  },
  
  // Legend styling
  legend: {
    verticalAlign: 'bottom' as const,
    height: 36,
    iconType: 'circle' as const,
    iconSize: 8,
  },
} as const;

// ===== TYPE EXPORTS =====

export type ChartColorKey = keyof typeof CHART_COLORS;
export type ChartGradientKey = keyof typeof CHART_GRADIENTS;
