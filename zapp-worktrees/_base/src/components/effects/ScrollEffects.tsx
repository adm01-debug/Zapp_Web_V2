import { motion, useScroll, useTransform, useSpring, useMotionValue, useVelocity, useAnimationFrame, type MotionValue } from 'framer-motion';
import { ReactNode, useRef } from 'react';
import { cn } from '@/lib/utils';
import { wrap } from '@/lib/utils';

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  strength?: number;
}

export function MagneticButton({ children, className, strength = 0.3 }: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    x.set((e.clientX - centerX) * strength);
    y.set((e.clientY - centerY) * strength);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  const springConfig = { stiffness: 150, damping: 15 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  return (
    <motion.div
      ref={ref}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('inline-block', className)}
    >
      {children}
    </motion.div>
  );
}

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
}

export function TextReveal({ text, className, delay = 0 }: TextRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end center']
  });

  const words = text.split(' ');

  return (
    <div ref={ref} className={cn('flex flex-wrap gap-x-2', className)}>
      {words.map((word, i) => {
        const start = i / words.length;
        const end = start + (1 / words.length);
        
        return (
          <Word key={i} progress={scrollYProgress} range={[start, end]}>
            {word}
          </Word>
        );
      })}
    </div>
  );
}

interface WordProps {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
}

function Word({ children, progress, range }: WordProps) {
  const opacity = useTransform(progress, range, [0.2, 1]);
  const y = useTransform(progress, range, [20, 0]);
  
  return (
    <motion.span style={{ opacity, y }} className="inline-block">
      {children}
    </motion.span>
  );
}

interface CounterProps {
  from: number;
  to: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
}

export function Counter({ 
  from, 
  to, 
  duration = 2, 
  className,
  suffix = '',
  prefix = ''
}: CounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(from);
  const springValue = useSpring(motionValue, { duration: duration * 1000 });

  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      onViewportEnter={() => motionValue.set(to)}
    >
      {prefix}
      <motion.span>
        {springValue.get().toFixed(0)}
      </motion.span>
      {suffix}
    </motion.span>
  );
}

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  colors?: string[];
  animate?: boolean;
}

export function GradientText({ 
  children, 
  className,
  colors = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))'],
  animate = true
}: GradientTextProps) {
  const gradient = `linear-gradient(90deg, ${colors.join(', ')})`;

  return (
    <motion.span
      className={cn('bg-clip-text text-transparent bg-[length:200%_auto]', className)}
      style={{ backgroundImage: gradient }}
      animate={animate ? {
        backgroundPosition: ['0% center', '100% center', '0% center']
      } : undefined}
      transition={{
        duration: 5,
        repeat: Infinity,
        ease: 'linear'
      }}
    >
      {children}
    </motion.span>
  );
}

interface ShimmerEffectProps {
  children: ReactNode;
  className?: string;
}

export function ShimmerEffect({ children, className }: ShimmerEffectProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {children}
      <motion.div
        className="absolute inset-0 -translate-x-full"
        style={{
          background: 'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.1), transparent)'
        }}
        animate={{ x: ['0%', '200%'] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'linear',
          repeatDelay: 1
        }}
      />
    </div>
  );
}

interface PerspectiveCardProps {
  children: ReactNode;
  className?: string;
  intensity?: number;
}

export function PerspectiveCard({ children, className, intensity = 10 }: PerspectiveCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const percentX = (e.clientX - centerX) / (rect.width / 2);
    const percentY = (e.clientY - centerY) / (rect.height / 2);
    
    rotateY.set(percentX * intensity);
    rotateX.set(-percentY * intensity);
  };

  const handleMouseLeave = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  const springConfig = { stiffness: 150, damping: 20 };
  const springRotateX = useSpring(rotateX, springConfig);
  const springRotateY = useSpring(rotateY, springConfig);

  return (
    <motion.div
      ref={ref}
      style={{
        rotateX: springRotateX,
        rotateY: springRotateY,
        transformStyle: 'preserve-3d',
        perspective: 1000
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('transition-shadow', className)}
    >
      {children}
    </motion.div>
  );
}

interface RippleButtonProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function RippleButton({ children, className, onClick }: RippleButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const button = e.currentTarget;
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ripple = document.createElement('span');
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.className = 'absolute rounded-full bg-background/30 animate-ripple pointer-events-none';
    
    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);

    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      className={cn('relative overflow-hidden', className)}
    >
      {children}
    </button>
  );
}

interface BlurRevealProps {
  children: ReactNode;
  className?: string;
}

export function BlurReveal({ children, className }: BlurRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center']
  });

  const blur = useTransform(scrollYProgress, [0, 1], [10, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.95, 1]);

  return (
    <motion.div
      ref={ref}
      style={{
        filter: blur.get() > 0 ? `blur(${blur.get()}px)` : 'none',
        opacity,
        scale
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
