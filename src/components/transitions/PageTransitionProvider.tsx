import { ReactNode } from 'react';
import { RouteTransition } from './RouteTransition';

interface PageTransitionProviderProps {
  children: ReactNode;
}

/**
 * Wrapper global de transições entre rotas. Respeita prefers-reduced-motion
 * e a preferência salva pelo usuário.
 */
export function PageTransitionProvider({ children }: PageTransitionProviderProps) {
  return <RouteTransition>{children}</RouteTransition>;
}