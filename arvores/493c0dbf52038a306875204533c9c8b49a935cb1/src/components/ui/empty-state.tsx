import { motion } from 'framer-motion';
import { LucideIcon, Plus, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { illustrations } from './empty-state-illustrations';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  illustration?: keyof typeof illustrations;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: {
    container: 'py-6',
    illustration: 'w-28 h-22',
    icon: 'w-10 h-10',
    iconContainer: 'w-14 h-14',
    title: 'text-base',
    description: 'text-sm',
  },
  md: {
    container: 'py-10',
    illustration: 'w-44 h-36',
    icon: 'w-7 h-7',
    iconContainer: 'w-14 h-14',
    title: 'text-lg',
    description: 'text-base',
  },
  lg: {
    container: 'py-16',
    illustration: 'w-56 h-44',
    icon: 'w-8 h-8',
    iconContainer: 'w-16 h-16',
    title: 'text-xl',
    description: 'text-base',
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  illustration,
  size = 'md',
  className,
}: EmptyStateProps) {
  const sizes = sizeClasses[size];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={cn('flex flex-col items-center justify-center text-center', sizes.container, className)}
    >
      {illustration && illustrations[illustration] ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className={cn('relative mb-6', sizes.illustration)}
        >
          {illustrations[illustration]}
          <div className="absolute inset-0 -z-10 blur-3xl">
            <div className="w-full h-full bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 rounded-full" />
          </div>
        </motion.div>
      ) : null}

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.3, delay: 0.3, type: 'spring', stiffness: 200 }}
        className={cn('flex items-center justify-center rounded-2xl mb-4', sizes.iconContainer)}
        style={{ background: 'var(--gradient-primary)' }}
      >
        <Icon className={cn('text-primary-foreground', sizes.icon)} />
      </motion.div>

      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className={cn('font-display font-semibold text-foreground mb-2', sizes.title)}
      >
        {title}
      </motion.h3>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
        className={cn('text-muted-foreground max-w-md mb-6', sizes.description)}
      >
        {description}
      </motion.p>

      {(actionLabel || secondaryActionLabel) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-3"
        >
          {actionLabel && onAction && (
            <Button
              onClick={onAction}
              size={size === 'sm' ? 'sm' : 'default'}
              className="group shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <Plus className="w-4 h-4 mr-2" />
              {actionLabel}
              <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
            </Button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <Button
              variant="ghost"
              onClick={onSecondaryAction}
              size={size === 'sm' ? 'sm' : 'default'}
              className="text-muted-foreground hover:text-foreground"
            >
              {secondaryActionLabel}
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
