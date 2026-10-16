/**
 * Kit de microinterações do chat — porta única de importação.
 *
 * Tudo o que uma tela do chat precisa vem daqui (`@/components/inbox/chat/motion`).
 * As peças: contagem (`AnimatedNumber`), espera (`ShimmerSkeleton`), traço
 * (`DrawLine`), realce (`FlashRing`), celebração (`PopBurst`), escolha
 * (`SlidingSegmented`), ação com estado (`MorphButton`) e entrada em cascata
 * (`StaggerList`/`StaggerItem`). As molas e o escalonamento vêm de
 * `src/lib/motion.ts` — não há constante de tempo solta no kit.
 */
export { toneClasses, MOTION_TONES, formatMotionNumber } from './tone';
export type { MotionTone, MotionToneClasses } from './tone';

export { AnimatedNumber } from './AnimatedNumber';
export type { AnimatedNumberProps } from './AnimatedNumber';

export { ShimmerSkeleton } from './ShimmerSkeleton';
export type { ShimmerSkeletonProps } from './ShimmerSkeleton';

export { DrawLine } from './DrawLine';
export type { DrawLineProps } from './DrawLine';

export { FlashRing, FLASH_RING_MS } from './FlashRing';
export type { FlashRingProps } from './FlashRing';

export { PopBurst, POP_BURST_MS } from './PopBurst';
export type { PopBurstProps } from './PopBurst';

export { SlidingSegmented } from './SlidingSegmented';
export type { SegmentedItem, SlidingSegmentedProps } from './SlidingSegmented';

export { MorphButton } from './MorphButton';
export type { MorphButtonProps, MorphState } from './MorphButton';

export { StaggerList, StaggerItem } from './StaggerList';
export type { StaggerListProps, StaggerItemProps } from './StaggerList';
