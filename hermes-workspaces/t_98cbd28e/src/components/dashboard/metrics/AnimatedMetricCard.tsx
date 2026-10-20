import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TrendDirection, MetricSize, MetricVariant } from './types';
import { TrendIndicator } from './TrendIndicator';
import { MiniSparkline } from './MiniSparkline';

interface AnimatedMetricCardProps {
  label: string;
  value: number | string;
  previousValue?: number;
  suffix?: string;
  prefix?: string;
  trend?: TrendDirection;
  trendValue?: number;
  trendLabel?: string;
  icon?: React.ElementType;
  variant?: MetricVariant;
  size?: MetricSize;
  sparkline?: number[];
  target?: number;
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
}

export function AnimatedMetricCard({
  label, value, previousValue, suffix = '', prefix = '', trend, trendValue, trendLabel,
  icon: Icon, variant = 'default', size = 'md', sparkline, target, isLoading, onClick, className,
}: AnimatedMetricCardProps) {
  const [displayValue, setDisplayValue] = React.useState(typeof value === 'number' ? 0 : value);

  React.useEffect(() => {
    if (typeof value !== 'number') { setDisplayValue(value); return; }
    const duration = 1000;
    const startTime = Date.now();
    const startValue = typeof previousValue === 'number' ? previousValue : 0;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(startValue + (value - startValue) * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value, previousValue]);

  const calculatedTrend = trend || (
    previousValue !== undefined && typeof value === 'number'
      ? value > previousValue ? 'up' : value < previousValue ? 'down' : 'neutral'
      : 'neutral'
  );

  const variantStyles = {
    default: { container: 'bg-card border-border hover:border-primary/30', icon: 'bg-primary/10 text-primary', value: 'text-foreground' },
    success: { container: 'bg-success/5 border-success/20 hover:border-success/40', icon: 'bg-success/10 text-success', value: 'text-success' },
    warning: { container: 'bg-warning/5 border-yellow-500/20 hover:border-yellow-500/40', icon: 'bg-warning/10 text-warning', value: 'text-warning' },
    danger: { container: 'bg-destructive/5 border-destructive/20 hover:border-destructive/40', icon: 'bg-destructive/10 text-destructive', value: 'text-destructive' },
    info: { container: 'bg-info/5 border-info/20 hover:border-info/40', icon: 'bg-info/10 text-info', value: 'text-info' },
  };

  const sizeStyles = {
    sm: { padding: 'p-3', value: 'text-xl', label: 'text-xs', icon: 'w-4 h-4' },
    md: { padding: 'p-4', value: 'text-2xl', label: 'text-sm', icon: 'w-5 h-5' },
    lg: { padding: 'p-5', value: 'text-3xl', label: 'text-sm', icon: 'w-6 h-6' },
    xl: { padding: 'p-6', value: 'text-4xl', label: 'text-base', icon: 'w-7 h-7' },
  };

  const styles = variantStyles[variant];
  const sizes = sizeStyles[size];

  const formatValue = (val: number | string): string => {
    if (typeof val === 'string') return val;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return Math.round(val).toLocaleString('pt-BR');
  };

  return (
    <motion.div
      onClick={onClick}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cn('relative rounded-xl border transition-all duration-300', styles.container, sizes.padding, onClick && 'cursor-pointer', className)}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
          <motion.div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <span className={cn('text-muted-foreground', sizes.label)}>{label}</span>
        {Icon && <div className={cn('p-2 rounded-lg', styles.icon)}><Icon className={sizes.icon} /></div>}
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        {prefix && <span className={cn('font-medium', sizes.label)}>{prefix}</span>}
        <motion.span key={String(value)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn('font-bold tabular-nums', sizes.value, styles.value)}>
          {formatValue(displayValue)}
        </motion.span>
        {suffix && <span className={cn('text-muted-foreground', sizes.label)}>{suffix}</span>}
      </div>
      {(trendValue !== undefined || calculatedTrend !== 'neutral') && (
        <div className="flex items-center gap-2">
          <TrendIndicator direction={calculatedTrend} value={trendValue} label={trendLabel} />
        </div>
      )}
      {target && typeof value === 'number' && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Meta</span><span>{Math.round((value / target) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div className="h-full rounded-full" style={{ background: 'var(--gradient-primary)' }} initial={{ width: 0 }} animate={{ width: `${Math.min((value / target) * 100, 100)}%` }} transition={{ duration: 1, ease: 'easeOut' }} />
          </div>
        </div>
      )}
      {sparkline && sparkline.length > 0 && <div className="mt-3"><MiniSparkline data={sparkline} /></div>}
    </motion.div>
  );
}
