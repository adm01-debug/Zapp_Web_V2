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

  const announce = React.useCallback((message: string, _politeness: 'polite' | 'assertive' = 'polite') => {
    // Clear first to ensure re-announcement of same message
    setAnnouncement('');
    setTimeout(() => setAnnouncement(message), 100);
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
