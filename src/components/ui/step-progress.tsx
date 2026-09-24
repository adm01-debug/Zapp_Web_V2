import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';

export interface Step {
  label: string;
  description?: string;
}

interface StepProgressProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function StepProgress({ steps, currentStep, className }: StepProgressProps) {
  return (
    <nav aria-label="Progresso" className={cn('flex items-center gap-1', className)}>
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isCurrent = idx === currentStep;

        return (
          <div key={idx} className="flex items-center gap-1">
            {/* Step circle */}
            <div className="flex items-center gap-1.5">
              <motion.div
                initial={false}
                animate={{
                  scale: isCurrent ? 1.1 : 1,
                  backgroundColor: isCompleted
                    ? 'hsl(var(--primary))'
                    : isCurrent
                      ? 'hsl(var(--primary) / 0.15)'
                      : 'hsl(var(--muted))',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-3xs font-bold shrink-0 border-2 transition-colors',
                  isCompleted && 'border-primary text-primary-foreground',
                  isCurrent && 'border-primary text-primary',
                  !isCompleted && !isCurrent && 'border-muted-foreground/20 text-muted-foreground/40',
                )}
              >
                {isCompleted ? (
                  <Check className="w-3 h-3" />
                ) : (
                  idx + 1
                )}
              </motion.div>
              <span
                className={cn(
                  'text-2xs font-medium whitespace-nowrap hidden sm:inline',
                  isCurrent && 'text-foreground',
                  isCompleted && 'text-primary',
                  !isCompleted && !isCurrent && 'text-muted-foreground/40',
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="w-6 h-0.5 mx-0.5 rounded-full overflow-hidden bg-muted-foreground/10">
                <motion.div
                  initial={false}
                  animate={{ width: isCompleted ? '100%' : '0%' }}
                  transition={{ duration: 0.3 }}
                  className="h-full bg-primary rounded-full"
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
