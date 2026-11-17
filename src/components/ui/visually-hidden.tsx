import * as React from 'react';
import { cn } from '@/lib/utils';

interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  as?: 'span' | 'div' | 'label';
}

/**
 * Component that hides content visually but keeps it accessible to screen readers
 */
export function VisuallyHidden({ 
  children, 
  as: Component = 'span',
  className,
  ...props 
}: VisuallyHiddenProps) {
  return (
    <Component
      className={cn('sr-only', className)}
      {...props}
    >
      {children}
    </Component>
  );
}

/**
 * Hook to announce content to screen readers
 */
export function useAnnounce() {
  const [announcement, setAnnouncement] = React.useState('');
  // O anúncio é agendado com atraso de 100 ms para forçar a releitura da MESMA
  // frase (limpa, espera, escreve). Sem guardar o timer, dois problemas: um
  // `announce` seguido de outro deixava o primeiro agendamento vivo e a frase
  // antiga sobrescrevia a nova; e o timer sobrevivia ao desmonte, chamando
  // `setAnnouncement` em componente que já saiu. Melhoria recuperada da branch
  // hermes/robustez-primitivos-ui-2610121626bec5-2610141859e423.
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = React.useCallback((message: string, _politeness: 'polite' | 'assertive' = 'polite') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Clear first to ensure re-announcement of same message
    setAnnouncement('');
    timerRef.current = setTimeout(() => setAnnouncement(message), 100);
  }, []);

  React.useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const Announcer = React.useMemo(() => {
    return function AnnouncerComponent() {
      return (
        <>
          <div
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {announcement}
          </div>
          <div
            aria-live="assertive"
            aria-atomic="true"
            className="sr-only"
          />
        </>
      );
    };
  }, [announcement]);

  return { announce, Announcer };
}

/**
 * Global live region for screen reader announcements
 */
export function LiveRegion() {
  return (
    <div
      id="live-region"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}
