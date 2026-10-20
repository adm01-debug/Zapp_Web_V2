import { ReactNode, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { buildVariants, type TransitionConfig } from './transitionVariants';
import { resolveTransition } from './transitionConfig';
import { useTransitionPreferences } from './useTransitionPreferences';

interface RouteTransitionProps {
  children: ReactNode;
}

export function RouteTransition({ children }: RouteTransitionProps) {
  const location = useLocation();
  const { reducedMotion } = useTransitionPreferences();

  const config: TransitionConfig = useMemo(() => {
    if (reducedMotion) return { variant: 'none' };
    return resolveTransition(location.pathname);
  }, [location.pathname, reducedMotion]);

  const variants = useMemo(() => buildVariants(config), [config]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        style={{ willChange: 'transform, opacity', height: '100%' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}