import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

const iconButtonVariants = cva(
  [
    'inline-flex items-center justify-center',
    'rounded-lg transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'relative overflow-hidden',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-glow-primary-sm',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        muted: 'bg-muted text-muted-foreground hover:bg-muted/80',
      },
      size: {
        sm: 'h-8 w-8',
        default: 'h-10 w-10',
        lg: 'h-12 w-12',
        xl: 'h-14 w-14',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'default',
    },
  }
);

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  /** Required for accessibility - describes the button action */
  'aria-label': string;
  /** Optional tooltip text (defaults to aria-label) */
  tooltip?: string;
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Tooltip side */
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  asChild?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ 
    className, 
    variant, 
    size, 
    'aria-label': ariaLabel,
    tooltip,
    showTooltip = true,
    tooltipSide = 'top',
    asChild = false,
    children,
    ...props 
  }, ref) => {
    const Comp = asChild ? Slot : 'button';
    
    const button = (
      <Comp
        className={cn(iconButtonVariants({ variant, size, className }))}
        ref={ref}
        aria-label={ariaLabel}
        {...props}
      >
        {children}
      </Comp>
    );

    if (showTooltip) {
      return (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            <p>{tooltip || ariaLabel}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  }
);
IconButton.displayName = 'IconButton';

// Motion variant with animations
interface MotionIconButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'ref'>,
    VariantProps<typeof iconButtonVariants> {
  'aria-label': string;
  tooltip?: string;
  showTooltip?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
}

const MotionIconButton = React.forwardRef<HTMLButtonElement, MotionIconButtonProps>(
  ({ 
    className, 
    variant, 
    size,
    'aria-label': ariaLabel,
    tooltip,
    showTooltip = true,
    tooltipSide = 'top',
    children,
    ...props 
  }, ref) => {
    const button = (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className={cn(iconButtonVariants({ variant, size, className }))}
        aria-label={ariaLabel}
        {...props}
      >
        {children}
      </motion.button>
    );

    if (showTooltip) {
      return (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent side={tooltipSide}>
            <p>{tooltip || ariaLabel}</p>
          </TooltipContent>
        </Tooltip>
      );
    }

    return button;
  }
);
MotionIconButton.displayName = 'MotionIconButton';

export { IconButton, MotionIconButton, iconButtonVariants };
