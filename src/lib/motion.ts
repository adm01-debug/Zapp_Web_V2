import type { Transition, Variants } from 'framer-motion';

/** ZAPP DarkBlue Premium — Motion tokens v1.0 */
export const zappMotion = {
  duration: {
    instant: 0.08,
    fast: 0.12,
    normal: 0.16,
    moderate: 0.20,
    slow: 0.24,
    deliberate: 0.32,
  },
  ease: {
    standard: [0.20, 0, 0, 1] as const,
    enter: [0.16, 1, 0.30, 1] as const,
    exit: [0.40, 0, 1, 1] as const,
  },
  distance: {
    micro: 2,
    small: 4,
    medium: 8,
    panel: 12,
  },
} as const;

export const zappTransition = {
  fast: {
    duration: zappMotion.duration.fast,
    ease: zappMotion.ease.standard,
  } satisfies Transition,
  normal: {
    duration: zappMotion.duration.normal,
    ease: zappMotion.ease.enter,
  } satisfies Transition,
  panel: {
    duration: zappMotion.duration.moderate,
    ease: zappMotion.ease.enter,
  } satisfies Transition,
};

export const zappSubviewVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: zappTransition.normal },
  exit: {
    opacity: 0,
    transition: { duration: zappMotion.duration.fast, ease: zappMotion.ease.exit },
  },
};

export const zappPanelVariants: Variants = {
  hidden: { opacity: 0, x: 12 },
  visible: { opacity: 1, x: 0, transition: zappTransition.panel },
  exit: { opacity: 0, x: 12, transition: zappTransition.fast },
};

export const zappPopoverVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1, transition: zappTransition.fast },
  exit: { opacity: 0, scale: 0.98, transition: zappTransition.fast },
};

/**
 * Molas do kit de microinterações do chat (acrescentado em 11/10/2026).
 * Aditivo: nada acima mudou. Cada mola é nomeada pelo uso, não pela física:
 *  - `soft`   — número que conta e entrada de item: acomoda sem estouro lento;
 *  - `snappy` — indicador que desliza e realce curto: responde rápido;
 *  - `pop`    — celebração (check/estrela): estouro contido, sem quicar demais.
 * Quem anima por JS usa `useReducedMotion()` para entregar o estado final direto.
 */
export const zappSpring = {
  soft: { type: 'spring', stiffness: 110, damping: 20, mass: 0.9 },
  snappy: { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 },
  pop: { type: 'spring', stiffness: 520, damping: 22, mass: 0.8 },
} satisfies Record<'soft' | 'snappy' | 'pop', Transition>;

/**
 * Escalonamento de entrada (fonte única do kit do chat): 60 ms por item, teto de
 * 8 itens — do 9º em diante entra junto, senão a lista demora a ficar inteira.
 */
export const zappStagger = {
  perItemSeconds: 0.06,
  maxItems: 8,
} as const;

/**
 * Atraso do item `index` (0-based) na entrada em cascata, **já com o teto
 * aplicado**: o item `maxItems - 1` (8º) e todos os seguintes entram juntos, no
 * mesmo atraso. É a única conta de escalonamento do kit — o `StaggerItem` não
 * repete a regra.
 */
export function zappStaggerDelaySeconds(index: number): number {
  const passo = Math.min(Math.max(index, 0), zappStagger.maxItems - 1);
  return passo * zappStagger.perItemSeconds;
}

/**
 * Prazos de "efeito que dura" do kit do chat (11/10/2026): o realce (`FlashRing`)
 * e a celebração (`PopBurst`) ficam mais tempo na tela que uma transição comum,
 * porque o olho precisa acompanhar o desaparecimento. Ficam aqui para o kit não
 * carregar número de tempo solto em componente.
 */
export const zappDurations = {
  flashRingSeconds: 0.6,
  popBurstSeconds: 0.7,
} as const;
