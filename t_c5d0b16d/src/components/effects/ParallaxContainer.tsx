import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import { ReactNode, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ParallaxContainerProps {
  children: ReactNode;
  className?: string;
  speed?: number;
  direction?: 'up' | 'down';
}

export function ParallaxContainer({ 
  children, 
  className, 
  speed = 0.5,
  direction = 'up' 
}: ParallaxContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start']
  });

  const multiplier = direction === 'up' ? -1 : 1;
  const y = useTransform(scrollYProgress, [0, 1], [0, 200 * speed * multiplier]);
  const smoothY = useSpring(y, { stiffness: 100, damping: 30 });

  return (
    <motion.div
      ref={ref}
      style={{ y: smoothY }}
      className={cn('will-change-transform', className)}
    >
      {children}
    </motion.div>
  );
}

interface ParallaxImageProps {
  src: string;
  alt: string;
  className?: string;
  speed?: number;
  scale?: boolean;
}

export function ParallaxImage({ 
  src, 
  alt, 
  className, 
  speed = 0.3,
  scale = true 
}: ParallaxImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start']
  });

  const y = useTransform(scrollYProgress, [0, 1], [-50 * speed, 50 * speed]);
  const scaleValue = useTransform(scrollYProgress, [0, 0.5, 1], [1, scale ? 1.1 : 1, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.6, 1, 1, 0.6]);

  return (
    <motion.div
      ref={ref}
      className={cn('overflow-hidden', className)}
      style={{ opacity }}
    >
      <motion.img
        src={src}
        alt={alt}
        style={{ y, scale: scaleValue }}
        className="w-full h-full object-cover will-change-transform"
      />
    </motion.div>
  );
}

interface ParallaxTextProps {
  children: ReactNode;
  className?: string;
  direction?: 'left' | 'right';
  speed?: number;
}

export function ParallaxText({ 
  children, 
  className,
  direction = 'left',
  speed = 100 
}: ParallaxTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start']
  });

  const multiplier = direction === 'left' ? -1 : 1;
  const x = useTransform(scrollYProgress, [0, 1], [0, speed * multiplier]);

  return (
    <motion.div
      ref={ref}
      style={{ x }}
      className={cn('will-change-transform', className)}
    >
      {children}
    </motion.div>
  );
}

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  variant?: 'fade' | 'slide-up' | 'slide-left' | 'slide-right' | 'scale' | 'rotate';
  delay?: number;
  duration?: number;
}

const variants = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  },
  'slide-up': {
    hidden: { opacity: 0, y: 60 },
    visible: { opacity: 1, y: 0 }
  },
  'slide-left': {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0 }
  },
  'slide-right': {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0 }
  },
  scale: {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1 }
  },
  rotate: {
    hidden: { opacity: 0, rotate: -10, scale: 0.9 },
    visible: { opacity: 1, rotate: 0, scale: 1 }
  }
};

export function ScrollReveal({ 
  children, 
  className,
  variant = 'slide-up',
  delay = 0,
  duration = 0.6
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center']
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [0, 1]);

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-100px' }}
      variants={variants[variant]}
      transition={{ 
        duration, 
        delay,
        ease: [0.22, 1, 0.36, 1]
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface ScrollProgressBarProps {
  className?: string;
  color?: string;
}

export function ScrollProgressBar({ className, color }: ScrollProgressBarProps) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <motion.div
      style={{ 
        scaleX,
        backgroundColor: color || 'hsl(var(--primary))'
      }}
      className={cn(
        'fixed top-0 left-0 right-0 h-1 origin-left z-50',
        className
      )}
    />
  );
}

interface FloatingElementProps {
  children: ReactNode;
  className?: string;
  amplitude?: number;
  frequency?: number;
}

export function FloatingElement({ 
  children, 
  className,
  amplitude = 10,
  frequency = 3
}: FloatingElementProps) {
  return (
    <motion.div
      animate={{
        y: [-amplitude, amplitude, -amplitude],
      }}
      transition={{
        duration: frequency,
        repeat: Infinity,
        ease: 'easeInOut'
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

interface GlowingOrbProps {
  className?: string;
  color?: string;
  size?: number;
  blur?: number;
}

export function GlowingOrb({ 
  className, 
  color = 'hsl(var(--primary))',
  size = 200,
  blur = 60
}: GlowingOrbProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1, 1.5, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.3, 0.6, 0.3]);

  return (
    <motion.div
      ref={ref}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
        filter: `blur(${blur}px)`,
        scale,
        opacity
      }}
      className={cn('absolute rounded-full pointer-events-none', className)}
    />
  );
}
