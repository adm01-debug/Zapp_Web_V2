// CV-129–130: CoachingToast component
import React, { useEffect, useRef } from 'react';
import type { CoachingCategory, CoachingHint } from '../../hooks/copilot/useCoachingHint';

export interface CoachingToastProps {
  hints: CoachingHint[];
  onDismiss: (pattern: string) => void;
}

const CATEGORY_ICONS: Record<CoachingCategory, string> = {
  price_anchor: '💰',
  objection_handling: '🛡️',
  follow_up: '⏰',
  closing: '🤝',
};

interface ToastItemProps {
  hint: CoachingHint;
  onDismiss: (pattern: string) => void;
}

function ToastItem({ hint, onDismiss }: ToastItemProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      onDismiss(hint.pattern);
    }, 8000);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint.pattern]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 px-4 py-3 shadow-md"
    >
      <span className="text-xl" aria-hidden="true">
        {CATEGORY_ICONS[hint.category]}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{hint.pattern}</p>
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{hint.tip}</p>
      </div>
      <button
        onClick={() => onDismiss(hint.pattern)}
        aria-label="Dispensar dica"
        className="shrink-0 rounded p-1 hover:bg-amber-200 dark:hover:bg-amber-900 text-amber-600 dark:text-amber-400"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * CV-129–130
 * Renders coaching hints as dismissible toast notifications.
 * Each toast auto-dismisses after 8 seconds.
 */
export function CoachingToast({ hints, onDismiss }: CoachingToastProps) {
  if (hints.length === 0) return null;

  return (
    <div
      aria-label="Dicas de coaching"
      className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-96 max-w-full"
    >
      {hints.map((hint) => (
        <ToastItem key={hint.pattern} hint={hint} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
