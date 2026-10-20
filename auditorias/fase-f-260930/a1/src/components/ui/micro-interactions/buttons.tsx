import * as React from 'react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';

// ============= RIPPLE BUTTON =============

interface RippleConfig {
  color?: string;
  duration?: number;
  size?: 'sm' | 'md' | 'lg';
}

interface RippleButtonProps {
  rippleConfig?: RippleConfig;
  variant?: 'default' | 'primary' | 'ghost' | 'neon';
  hapticFeedback?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  'aria-label'?: string;
}

const rippleVariants = {
  default: 'rgba(255, 255, 255, 0.3)',
  primary: 'hsl(var(--primary) / 0.4)',
  ghost: 'hsl(var(--foreground) / 0.1)',
  neon: 'hsl(var(--primary) / 0.6)',
};

const rippleSizes = { sm: 80, md: 150, lg: 250 };

export function RippleButton({
  rippleConfig = {},
  variant = 'default',
  hapticFeedback = true,
  children,
  className,
  onClick,
  disabled,
  type = 'button',
  'aria-label': ariaLabel,
}: RippleButtonProps) {
  const [ripples, setRipples] = React.useState<Array<{ x: number; y: number; id: number; size: number }>>([]);
  const [isPressed, setIsPressed] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const controls = useAnimation();

  const rippleColor = rippleConfig.color || rippleVariants[variant];
  const rippleDuration = rippleConfig.duration || 600;
  const rippleSize = rippleSizes[rippleConfig.size || 'md'];

  const triggerHaptic = React.useCallback(() => {
    if (!hapticFeedback) return;
    controls.start({ scale: [1, 0.97, 1.02, 1], transition: { duration: 0.2, ease: 'easeInOut' } });
  }, [hapticFeedback, controls]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples((prev) => [...prev, { x: e.clientX - rect.left, y: e.clientY - rect.top, id, size: rippleSize }]);
    triggerHaptic();
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), rippleDuration);
    onClick?.(e);
  };

  return (
    <motion.button
      ref={buttonRef}
      animate={controls}
      onClick={handleClick}
      onMouseDown={() => !disabled && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      disabled={disabled}
      type={type}
      aria-label={ariaLabel}
      className={cn('relative overflow-hidden transition-all duration-200', isPressed && 'scale-[0.98]', disabled && 'opacity-50 cursor-not-allowed', className)}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
    >
      {children}
      <AnimatePresence>
        {ripples.map((ripple) => (
          <motion.span
            key={ripple.id}
            initial={{ scale: 0, opacity: 0.8 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: rippleDuration / 1000, ease: 'easeOut' }}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: ripple.x, top: ripple.y, width: rippleSize, height: rippleSize,
              backgroundColor: rippleColor, transform: 'translate(-50%, -50%)',
              boxShadow: variant === 'neon' ? `0 0 20px ${rippleColor}` : undefined,
            }}
          />
        ))}
      </AnimatePresence>
    </motion.button>
  );
}

// ============= INTERACTIVE ICON BUTTON =============

interface InteractiveIconButtonProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  pulseOnHover?: boolean;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
}

const iconButtonVariants = {
  default: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};

const iconButtonSizes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12' };

export function InteractiveIconButton({
  children, variant = 'ghost', size = 'md', pulseOnHover = false,
  className, disabled, onClick, 'aria-label': ariaLabel,
}: InteractiveIconButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <motion.button
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex items-center justify-center rounded-lg transition-all duration-200 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        iconButtonVariants[variant], iconButtonSizes[size],
        disabled && 'opacity-50 cursor-not-allowed', className
      )}
    >
      <motion.span animate={isHovered && pulseOnHover ? { scale: [1, 1.1, 1], transition: { repeat: Infinity, duration: 0.8 } } : {}}>
        {children}
      </motion.span>
      {isHovered && variant === 'primary' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/40 to-primary/20 blur-xl -z-10" />
      )}
    </motion.button>
  );
}

// ============= BOUNCE TAP BUTTON =============

interface BounceTapProps {
  children: React.ReactNode;
  bounceIntensity?: 'light' | 'medium' | 'strong';
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const bounceValues = { light: { scale: 0.98, y: 1 }, medium: { scale: 0.95, y: 2 }, strong: { scale: 0.92, y: 4 } };

export function BounceTapButton({ children, bounceIntensity = 'medium', className, onClick, disabled, type = 'button' }: BounceTapProps) {
  const bounce = bounceValues[bounceIntensity];
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: bounce.scale, y: bounce.y }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={cn('relative overflow-hidden', className)}
      onClick={onClick} disabled={disabled} type={type}
    >
      {children}
    </motion.button>
  );
}

// ============= MAGNETIC BUTTON =============

interface MagneticButtonProps {
  children: React.ReactNode;
  intensity?: number;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

export function MagneticButton({ children, intensity = 0.3, className, onClick, disabled }: MagneticButtonProps) {
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!buttonRef.current || disabled) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setPosition({ x: (e.clientX - rect.left - rect.width / 2) * intensity, y: (e.clientY - rect.top - rect.height / 2) * intensity });
  };

  return (
    <motion.button ref={buttonRef} onMouseMove={handleMouseMove} onMouseLeave={() => setPosition({ x: 0, y: 0 })}
      onClick={onClick} disabled={disabled} animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      className={cn('relative', disabled && 'opacity-50 cursor-not-allowed', className)}
    >
      {children}
    </motion.button>
  );
}

// ============= GLOW BUTTON =============

interface GlowButtonProps {
  children: React.ReactNode;
  glowColor?: string;
  glowIntensity?: 'subtle' | 'medium' | 'intense';
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}

const glowIntensities = { subtle: '0 0 20px', medium: '0 0 40px', intense: '0 0 60px' };

export function GlowButton({ children, glowColor = 'hsl(var(--primary))', glowIntensity = 'medium', className, onClick, disabled, type = 'button' }: GlowButtonProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <motion.button
      onHoverStart={() => !disabled && setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.98 } : undefined}
      onClick={onClick} disabled={disabled} type={type}
      className={cn('relative overflow-hidden transition-shadow duration-300', disabled && 'opacity-50 cursor-not-allowed', className)}
      style={{ boxShadow: isHovered ? `${glowIntensities[glowIntensity]} ${glowColor}` : 'none' }}
    >
      {children}
      {isHovered && (
        <motion.div
          initial={{ opacity: 0, rotate: 0 }}
          animate={{ opacity: 1, rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            background: `conic-gradient(from 0deg, transparent, ${glowColor}, transparent)`,
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'xor', WebkitMaskComposite: 'xor', padding: '2px',
          }}
        />
      )}
    </motion.button>
  );
}

// ============= PRESS FEEDBACK =============

interface PressFeedbackProps {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
}

export function PressFeedback({ children, onPress, disabled, className }: PressFeedbackProps) {
  return (
    <motion.div
      whileHover={!disabled ? { scale: 1.02 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      onClick={!disabled ? onPress : undefined}
      className={cn('cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className)}
    >
      {children}
    </motion.div>
  );
}
