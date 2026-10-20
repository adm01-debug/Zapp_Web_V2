import { describe, it, expect } from 'vitest';
import { buildVariants, type TransitionVariantName } from '../transitionVariants';
import { resolveTransition, routeTransitions } from '../transitionConfig';

const variants: TransitionVariantName[] = ['none', 'fade', 'slide', 'zoom', 'flip', 'parallax'];

describe('buildVariants', () => {
  it.each(variants)('produz initial/animate/exit válidos para %s', (variant) => {
    const v = buildVariants({ variant });
    expect(v.initial).toBeDefined();
    expect(v.animate).toBeDefined();
    expect(v.exit).toBeDefined();
  });

  it('respeita cap de 400ms na duration', () => {
    const v = buildVariants({ variant: 'fade', duration: 5 });
    const animate = v.animate as { transition?: { duration?: number } };
    expect(animate.transition?.duration).toBeLessThanOrEqual(0.4);
  });
});

describe('resolveTransition', () => {
  it('matches by prefix mais longo', () => {
    const cfg = resolveTransition('/sla/history');
    expect(cfg).toBe(routeTransitions['/sla']);
  });

  it('cai no default quando não há match', () => {
    const cfg = resolveTransition('/rota-inexistente');
    expect(cfg.variant).toBe('fade');
  });
});