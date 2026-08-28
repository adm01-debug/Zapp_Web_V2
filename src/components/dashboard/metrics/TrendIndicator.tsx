import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { TrendDirection } from './types';

interface TrendIndicatorProps {
  direction: TrendDirection;
  value?: number;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function TrendIndicator({ direction, value, label, size = 'sm', className }: TrendIndicatorProps) {
  const configs = {
    up: { icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
    down: { icon: TrendingDown, color: 'text-destructive', bg: 'bg-destructive/10' },
    neutral: { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted' },
  };

  const config = configs[direction];
  const Icon = config.icon;

  const sizes = {
    sm: { icon: 'w-3 h-3', text: 'text-xs', padding: 'px-1.5 py-0.5' },
    md: { icon: 'w-4 h-4', text: 'text-sm', padding: 'px-2 py-1' },
  };

  const sizeConfig = sizes[size];

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn('inline-flex items-center gap-1 rounded-full', config.bg, sizeConfig.padding, className)}
    >
      <Icon className={cn(sizeConfig.icon, config.color)} />
      {value !== undefined && (
        <span className={cn('font-medium', sizeConfig.text, config.color)}>
          {direction === 'up' ? '+' : ''}{value}%
        </span>
      )}
      {label && <span className={cn('text-muted-foreground', sizeConfig.text)}>{label}</span>}
    </motion.div>
  );
}
