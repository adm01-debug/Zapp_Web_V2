/**
 * Movimento do módulo Contatos (RD-004).
 *
 * Fonte única das durações, curvas, da entrada da ficha e da rolagem do
 * carrossel: os componentes do módulo importam daqui em vez de espalhar tempo
 * solto. Os tokens globais continuam em `src/lib/motion.ts` — este arquivo
 * REUSA o que já existe lá (a curva padrão é o token `zappMotion.ease.standard`)
 * e só acrescenta o que o modelo de Contatos traz de próprio: a curva do retrato
 * `cubic-bezier(.2,.8,.2,1)`.
 *
 * Quem pediu menos movimento (`prefers-reduced-motion: reduce`):
 *  - todas as durações viram 0 (`contactsDurationsFor(true)`);
 *  - o carrossel não anda sozinho (`contactsCarouselMotion(true).autoplay === false`);
 *  - a ficha aparece direto no estado final: `initial: false` é a forma do
 *    framer-motion de aplicar o alvo (`visible`) no primeiro paint, sem animar.
 */
import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { Transition, Variants } from 'framer-motion';
import { zappMotion } from '@/lib/motion';

/** As durações do módulo, em milissegundos — os três prazos do modelo. */
export const contactsDurationsMs = {
  micro: 120,
  hover: 220,
  portrait: 550,
} as const;

/** As mesmas durações em segundos, que é a unidade que o framer-motion usa. */
export const contactsDurations = {
  micro: contactsDurationsMs.micro / 1000,
  hover: contactsDurationsMs.hover / 1000,
  portrait: contactsDurationsMs.portrait / 1000,
} as const;

const paraCss = (pontos: readonly number[]) => `cubic-bezier(${pontos.join(',')})`;

/** Curvas do módulo em array (framer-motion). */
export const contactsEase = {
  /** Token global reusado, não recriado. */
  standard: zappMotion.ease.standard,
  /** Curva do retrato, do modelo de Contatos. */
  portrait: [0.2, 0.8, 0.2, 1],
} as const;

/** As mesmas curvas em CSS. */
export const contactsEaseCss = {
  standard: paraCss(contactsEase.standard),
  /** Cópia literal do modelo (`transition: transform .55s cubic-bezier(.2,.8,.2,1)`). */
  portrait: 'cubic-bezier(.2,.8,.2,1)',
} as const;

/** Deslocamento vertical da entrada da ficha, em px. */
export const CONTACTS_FICHA_DISTANCE = 12;

const contactsFichaTransition: Transition = {
  duration: contactsDurations.hover,
  ease: contactsEase.standard,
};

/** Entrada da ficha: aparece e sobe 12 px. O estado `visible` é o estado final. */
export const contactsFichaVariants: Variants = {
  hidden: { opacity: 0, y: CONTACTS_FICHA_DISTANCE },
  visible: { opacity: 1, y: 0, transition: contactsFichaTransition },
};

/** Valor que desliga a animação de entrada (framer-motion: `initial: false`). */
export const contactsFichaReducedInitial = false as const;

/**
 * Durações efetivas do módulo, em milissegundos. Com reduzir ligado devolvem 0:
 * nada anima, nada se desloca — o estado final aparece direto.
 */
export function contactsDurationsFor(reduced: boolean) {
  const fator = reduced ? 0 : 1;
  return {
    micro: contactsDurationsMs.micro * fator,
    hover: contactsDurationsMs.hover * fator,
    portrait: contactsDurationsMs.portrait * fator,
  };
}

/** Props de movimento da ficha (função pura, para teste sem singleton). */
export function contactsFichaMotion(reduced: boolean) {
  return {
    initial: reduced ? contactsFichaReducedInitial : 'hidden',
    animate: 'visible',
    variants: contactsFichaVariants,
    durationMs: contactsDurationsFor(reduced).hover,
  };
}

/**
 * Rolagem do carrossel do módulo. Com reduzir ligado ele NÃO anda sozinho:
 * sem autoplay e sem rolagem animada (0 ms). Rolagem à mão continua livre.
 */
export function contactsCarouselMotion(reduced: boolean) {
  return {
    autoplay: !reduced,
    scrollDurationMs: reduced ? 0 : contactsDurationsMs.portrait,
  };
}

/** O que a tela usa: lê `prefers-reduced-motion` e entrega as três partes juntas. */
export function useContactsMotion() {
  const reduzirMovimento = useReducedMotion() ?? false;
  return useMemo(
    () => ({
      reduced: reduzirMovimento,
      durations: contactsDurationsFor(reduzirMovimento),
      ficha: contactsFichaMotion(reduzirMovimento),
      carousel: contactsCarouselMotion(reduzirMovimento),
    }),
    [reduzirMovimento],
  );
}
