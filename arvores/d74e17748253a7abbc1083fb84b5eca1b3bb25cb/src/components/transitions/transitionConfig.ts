import type { TransitionConfig } from './transitionVariants';

export const routeTransitions: Record<string, TransitionConfig> = {
  '/auth': { variant: 'fade', duration: 0.25 },
  '/forgot-password': { variant: 'fade', duration: 0.2 },
  '/reset-password': { variant: 'fade', duration: 0.2 },
  '/verify-email': { variant: 'fade', duration: 0.2 },
  '/2fa': { variant: 'zoom', duration: 0.25 },
  '/install': { variant: 'slide', direction: 'up', duration: 0.3 },
  '/queue': { variant: 'slide', direction: 'right', duration: 0.28 },
  '/queues': { variant: 'slide', direction: 'right', duration: 0.28 },
  '/sla': { variant: 'zoom', duration: 0.3 },
  '/admin': { variant: 'slide', direction: 'left', duration: 0.28 },
  '/chat-popup': { variant: 'zoom', duration: 0.25 },
};

export const defaultTransition: TransitionConfig = {
  variant: 'fade',
  duration: 0.2,
};

export function resolveTransition(pathname: string): TransitionConfig {
  const match = Object.keys(routeTransitions)
    .filter((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? routeTransitions[match] : defaultTransition;
}

const STORAGE_KEY = 'zapp:reduce-motion';

export function readReduceMotionPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeReduceMotionPreference(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}