/**
 * Accessibility utility for screen reader announcements via ARIA live regions.
 * Uses the live regions added in AppShell.tsx.
 */

/**
 * Announce a message to screen readers (polite — waits for current speech to finish)
 */
export function announceStatus(message: string): void {
  const el = document.getElementById('a11y-status');
  if (el) {
    el.textContent = '';
    // Force DOM update so screen readers detect the change
    requestAnimationFrame(() => {
      el.textContent = message;
    });
  }
}

/**
 * Announce an urgent message to screen readers (assertive — interrupts current speech)
 */
export function announceAlert(message: string): void {
  const el = document.getElementById('a11y-alert');
  if (el) {
    el.textContent = '';
    requestAnimationFrame(() => {
      el.textContent = message;
    });
  }
}
