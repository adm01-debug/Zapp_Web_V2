import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Award } from 'lucide-react';

interface GoalProgressRingProps {
  value: number;
  target: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  className?: string;
}

export function GoalProgressRing({ value, target, label, size = 'md', showPercentage = true, className }: GoalProgressRingProps) {
  const percentage = Math.min((value / target) * 100, 100);
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const sizes = {
    sm: { svg: 80, text: 'text-lg', label: 'text-xs' },
    md: { svg: 100, text: 'text-2xl', label: 'text-sm' },
    lg: { svg: 120, text: 'text-3xl', label: 'text-sm' },
  };

  const sizeConfig = sizes[size];
  const variant = percentage >= 100 ? 'success' : percentage >= 75 ? 'primary' : percentage >= 50 ? 'warning' : 'danger';
  const colors = { success: 'stroke-green-500', primary: 'stroke-primary', warning: 'stroke-yellow-500', danger: 'stroke-destructive' };

  return (
    <div className={cn('flex flex-col items-center', className)}>
      <div className="relative" style={{ width: sizeConfig.svg, height: sizeConfig.svg }}>
        <svg className="transform -rotate-90" width={sizeConfig.svg} height={sizeConfig.svg}>
          <circle cx={sizeConfig.svg / 2} cy={sizeConfig.svg / 2} r="40" fill="none" className="stroke-muted" strokeWidth="8" />
          <motion.circle
            cx={sizeConfig.svg / 2} cy={sizeConfig.svg / 2} r="40" fill="none"
            className={colors[variant]} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference} initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }} transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {showPercentage ? (
            <motion.span key={Math.round(percentage)} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className={cn('font-bold', sizeConfig.text)}>
              {Math.round(percentage)}%
            </motion.span>
          ) : (
            <>
              <span className={cn('font-bold', sizeConfig.text)}>{value}</span>
              <span className="text-xs text-muted-foreground">/{target}</span>
            </>
          )}
        </div>
        <AnimatePresence>
          {percentage >= 100 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-success flex items-center justify-center">
              <Award className="w-3.5 h-3.5 text-primary-foreground" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className={cn('mt-2 text-muted-foreground', sizeConfig.label)}>{label}</span>
    </div>
  );
}
