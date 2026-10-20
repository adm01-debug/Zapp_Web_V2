/** Shared chart styling constants for Queue analytics */

import { CHART_TICK_FONT_SIZE_LG } from '@/lib/chart-theme';

export const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
} as const;

export const AXIS_PROPS = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: CHART_TICK_FONT_SIZE_LG,
  tickLine: false,
  axisLine: false,
} as const;

export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'hsl(var(--border))',
  opacity: 0.3,
} as const;
