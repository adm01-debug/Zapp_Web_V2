import type { KeyboardEvent } from 'react';

/**
 * Navegação por setas entre irmãos `[role="radio"]` de um `radiogroup`
 * (D6 do plano — melhoria de a11y que o Promo Gifts não tem).
 */
export function focusSibling(e: KeyboardEvent<HTMLElement>, dir: 1 | -1 | 'home' | 'end') {
  const group = e.currentTarget.closest('[role="radiogroup"]');
  if (!group) return;
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
  const currentIndex = radios.indexOf(e.currentTarget as HTMLElement);
  if (currentIndex === -1) return;

  let nextIndex: number;
  if (dir === 'home') nextIndex = 0;
  else if (dir === 'end') nextIndex = radios.length - 1;
  else nextIndex = (currentIndex + dir + radios.length) % radios.length;

  e.preventDefault();
  radios[nextIndex]?.focus();
}
