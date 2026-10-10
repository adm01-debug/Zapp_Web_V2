import { useEffect, useState } from 'react';
import { readReduceMotionPreference, writeReduceMotionPreference } from './transitionConfig';

export interface TransitionPreferences {
  enabled: boolean;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
}

export function useTransitionPreferences(): TransitionPreferences {
  const [systemReduced, setSystemReduced] = useState(false);
  const [userReduced, setUserReduced] = useState<boolean>(() => readReduceMotionPreference());

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const reducedMotion = systemReduced || userReduced;

  return {
    enabled: !reducedMotion,
    reducedMotion,
    setReducedMotion: (value: boolean) => {
      setUserReduced(value);
      writeReduceMotionPreference(value);
    },
  };
}