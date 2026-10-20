/**
 * Motion barrel file.
 * Re-exports all sub-modules for backward compatibility.
 */
export {
  fadeInUp, fadeIn, scaleIn, slideInRight, slideInLeft,
  staggerContainer, staggerItem, neonReveal, staggeredNeonContainer, staggeredNeonItem,
} from './motion/variants';

export {
  PageTransition, NeonPageReveal, MotionCard, MotionButton,
  StaggeredList, StaggeredItem, MotionFadeIn, MotionSlideUp,
  MotionScale, MotionInteractive, SkeletonShimmer,
} from './motion/components';

export {
  AnimatedCounter, AnimatedProgress, Presence, StaggerContainerEnhanced,
  SlideTransition, HoverScale, AnimatedList, AnimatedListItem, Typewriter,
} from './motion/effects';

// Re-exports from framer-motion for convenience
export { AnimatePresence, motion } from 'framer-motion';
