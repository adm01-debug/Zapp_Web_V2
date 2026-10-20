import type { Transition, Variants } from 'framer-motion';

export const zappDarkblueMotion = {
  duration: {
    instant: 0.08,
    fast: 0.12,
    normal: 0.16,
    moderate: 0.20,
    slow: 0.24,
    deliberate: 0.32,
  },
  ease: {
    standard: [0.20, 0, 0, 1] as const,
    enter: [0.16, 1, 0.30, 1] as const,
    exit: [0.40, 0, 1, 1] as const,
  },
  distance: {
    micro: 2,
    small: 4,
    medium: 8,
    panel: 12,
  },
} as const;

export const zappTransition = {
  fast: {
    duration: zappDarkblueMotion.duration.fast,
    ease: zappDarkblueMotion.ease.standard,
  } satisfies Transition,
  normal: {
    duration: zappDarkblueMotion.duration.normal,
    ease: zappDarkblueMotion.ease.enter,
  } satisfies Transition,
  panel: {
    duration: zappDarkblueMotion.duration.moderate,
    ease: zappDarkblueMotion.ease.enter,
  } satisfies Transition,
};

export const zappSubviewVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: zappTransition.normal,
  },
  exit: {
    opacity: 0,
    transition: {
      duration: zappDarkblueMotion.duration.fast,
      ease: zappDarkblueMotion.ease.exit,
    },
  },
};

export const zappPanelVariants: Variants = {
  hidden: { opacity: 0, x: 12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: zappTransition.panel,
  },
  exit: {
    opacity: 0,
    x: 12,
    transition: zappTransition.fast,
  },
};

export const zappPopoverVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: zappTransition.fast,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: zappTransition.fast,
  },
};

/**
 * Operational motion rules
 *
 * DO:
 * - opacity
 * - 2–4px translation
 * - subtle panel transition
 * - button press 0.98
 * - accordion height/opacity
 *
 * DON'T:
 * - stagger conversation rows
 * - blur reveal
 * - permanent neon/glow
 * - y:-4 card hover
 * - bounce
 * - large scale
 * - decorative motion loops
 */
