import { useEffect, useRef } from 'react';

/** E86: skip link — focuses the message list on activation. */
export function TeamChatSkipLink({ targetId = 'team-chat-messages' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className={
        'sr-only focus:not-sr-only ' +
        'fixed top-2 left-2 z-[9999] ' +
        'bg-background text-foreground border border-border ' +
        'px-4 py-2 rounded-md text-sm font-medium ' +
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring '
      }
    >
      Ir para mensagens
    </a>
  );
}

/** E87: live region for screen-reader announcements. */
export function TeamChatAnnouncer({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

/** E88: ARIA helper — returns props for a message bubble. */
export function getMessageAriaProps(isOwn: boolean, senderName: string) {
  return {
    role: 'article' as const,
    'aria-label': isOwn ? 'Minha mensagem' : `Mensagem de ${senderName}`,
  };
}

/**
 * E89: focus trap — keeps focus within the container when `active` is true.
 * Returns a ref to attach to the container element.
 */
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const el = containerRef.current;
    const focusable = el.querySelectorAll<HTMLElement>(
      'a,button,input,textarea,select,[tabindex]:not([tabindex="-1"])'
    );
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [active]);

  return containerRef;
}

/** E90: returns true when the user prefers reduced motion. */
export function usePrefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
