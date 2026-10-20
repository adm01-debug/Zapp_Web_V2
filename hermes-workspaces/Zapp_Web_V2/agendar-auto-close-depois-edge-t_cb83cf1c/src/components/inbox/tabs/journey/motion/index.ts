/**
 * J05 — Peças de efeito sutil do Journey (D12 ampliada em 07/10/2026).
 *
 * A onda 2 (S061-S094, fase K) importa daqui:
 *
 *   import { CARD_INTERACTIVE, CHEVRON_REVEAL, GLOW_RING, FadeSlideIn, Collapse,
 *            HighlightPulse, useCountUp } from '@/components/inbox/tabs/journey/motion';
 *
 * `FadeSlideIn` envolve o cartão do episódio (com `index`), `Collapse` anima as
 * mensagens agrupadas, `HighlightPulse` marca a chegada no episódio aberto pelo
 * clique e `useCountUp` anima os números do `JourneyStatsHero`. Nada aqui é
 * importado pelo bundle inicial: a aba Journey é carregada sob demanda.
 */
export {
  CARD_INTERACTIVE,
  CHEVRON_REVEAL,
  FADE_SLIDE_VIEWPORT,
  GLOW_RING,
  MOTION,
  STAGGER_MAX_ITEMS,
  STAGGER_PER_ITEM_MS,
  fadeSlideDelay,
} from './presets';
export type { GlowToken } from './presets';

export { FadeSlideIn } from './FadeSlideIn';
export type { FadeSlideInProps } from './FadeSlideIn';

export { HIGHLIGHT_DURATION_MS, HighlightPulse } from './HighlightPulse';
export type { HighlightPulseProps } from './HighlightPulse';

export { Collapse } from './Collapse';
export type { CollapseProps } from './Collapse';

export { COUNT_UP_DURATION_MS, useCountUp } from './useCountUp';
