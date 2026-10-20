import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface MiniSparklineProps {
  data: number[];
  height?: number;
  color?: string;
  className?: string;
}

export function MiniSparkline({ data, height = 24, color = 'hsl(var(--primary))', className }: MiniSparklineProps) {
  if (data.length === 0) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className={cn('w-full', className)} style={{ height }}>
      <motion.polyline
        fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        points={points} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
      <defs>
        <linearGradient id="sparklineGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.polygon
        fill="url(#sparklineGradient)" points={`0,${height} ${points} 100,${height}`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }}
      />
    </svg>
  );
}
