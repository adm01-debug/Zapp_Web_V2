import type { Variants, Variant } from 'framer-motion';

export type TransitionVariantName =
  | 'none'
  | 'fade'
  | 'slide'
  | 'zoom'
  | 'flip'
  | 'parallax';

export type SlideDirection = 'left' | 'right' | 'up' | 'down';
export type FlipAxis = 'x' | 'y';

export interface TransitionConfig {
  variant: TransitionVariantName;
  duration?: number;
  easing?: [number, number, number, number];
  direction?: SlideDirection;
  distance?: number;
  scaleFrom?: number;
  axis?: FlipAxis;
  speed?: number;
}

const EASE_SMOOTH: [number, number, number, number] = [0.22, 1, 0.36, 1];
const MAX_DURATION = 0.4;

function clampDuration(d?: number): number {
  const value = d ?? 0.25;
  return Math.min(Math.max(value, 0.05), MAX_DURATION);
}

export function buildVariants(config: TransitionConfig): Variants {
  const duration = clampDuration(config.duration);
  const ease = config.easing ?? EASE_SMOOTH;

  switch (config.variant) {
    case 'none':
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.08 } },
        exit: { opacity: 0, transition: { duration: 0.08 } },
      };

    case 'slide': {
      const distance = config.distance ?? 24;
      const dir = config.direction ?? 'right';
      const axis = dir === 'left' || dir === 'right' ? 'x' : 'y';
      const sign = dir === 'left' || dir === 'up' ? -1 : 1;
      return {
        initial: { opacity: 0, [axis]: sign * distance } as Variant,
        animate: { opacity: 1, [axis]: 0, transition: { duration, ease } } as Variant,
        exit: { opacity: 0, [axis]: sign * -distance, transition: { duration, ease } } as Variant,
      };
    }

    case 'zoom': {
      const scaleFrom = config.scaleFrom ?? 0.96;
      return {
        initial: { opacity: 0, scale: scaleFrom },
        animate: { opacity: 1, scale: 1, transition: { duration, ease } },
        exit: { opacity: 0, scale: scaleFrom, transition: { duration, ease } },
      };
    }

    case 'flip': {
      const axis = config.axis ?? 'y';
      const rotateKey = axis === 'y' ? 'rotateY' : 'rotateX';
      return {
        initial: { opacity: 0, [rotateKey]: 90 } as Variant,
        animate: { opacity: 1, [rotateKey]: 0, transition: { duration, ease } } as Variant,
        exit: { opacity: 0, [rotateKey]: -90, transition: { duration, ease } } as Variant,
      };
    }

    case 'parallax': {
      const speed = config.speed ?? 1;
      return {
        initial: { opacity: 0, y: 40 * speed },
        animate: { opacity: 1, y: 0, transition: { duration, ease } },
        exit: { opacity: 0, y: -40 * speed, transition: { duration, ease } },
      };
    }

    case 'fade':
    default:
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration, ease } },
        exit: { opacity: 0, transition: { duration, ease } },
      };
  }
}