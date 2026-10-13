/**
 * UK-14 — contrato das variantes de motion (`src/components/ui/motion/variants`).
 *
 * As variantes são a base de todo movimento do produto. Aqui se prova o que o
 * revisor pede: os valores de cada estado (sem snapshot frágil), que o
 * deslocamento só acontece entre estados e SEMPRE volta ao repouso no estado
 * final (`visible`), e que a família de propriedades animadas fica restrita a
 * transform/opacidade — o que permite `MotionConfig reducedMotion` neutralizar
 * o movimento sem deixar o elemento fora de lugar.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useReducedMotion } from 'framer-motion';

import * as vars from '@/components/ui/motion/variants';
import { fadeInUp, scaleIn, slideInRight, talkxStagger, neonReveal } from '@/components/ui/motion/variants';

afterEach(cleanup);

/** Deslocamento de repouso: quando o estado final chega, nada fica deslocado. */
const REPOUSO = { x: 0, y: 0, scale: 1 } as Record<string, number>;

/** Chaves que representam deslocamento geométrico (o blur não desloca). */
function chavesDeMovimento(estado: object): string[] {
  return ['x', 'y', 'scale'].filter((k) => k in estado);
}

const variantes = Object.entries(vars).filter(
  ([, v]) => v && typeof v === 'object' && 'hidden' in (v as object) && 'visible' in (v as object),
) as Array<[string, Record<string, Record<string, unknown>>]>;

describe('variants — contrato do movimento (UK-14)', () => {
  it('só anima transform/opacidade (nenhuma variante usa rotate/skew/height)', () => {
    for (const [nome, variante] of variantes) {
      for (const estado of ['hidden', 'visible', 'exit'] as const) {
        const bloco = variante[estado];
        if (!bloco) continue;
        for (const chave of Object.keys(bloco)) {
          // bloquearia a regra: 'movimento só em transform/opacity'
          const proibida = ['rotate', 'rotateX', 'rotateY', 'skewX', 'skewY', 'height', 'width', 'top', 'left', 'marginTop'];
          expect(proibida, `${nome}.${estado} usa "${chave}"`).not.toContain(chave);
        }
      }
    }
  });

  it('toda variante com deslocamento o zera no estado final (visible)', () => {
    for (const [nome, variante] of variantes) {
      const escondido = chavesDeMovimento(variante.hidden);
      if (escondido.length === 0) continue;

      for (const chave of escondido) {
        const valorFinal = variante.visible[chave] as number | number[];
        expect(valorFinal, `${nome}.visible.${chave}`).toBe(REPOUSO[chave]);
      }
    }
  });

  it('fadeInUp: valores dos estados e transição do estado final', () => {
    expect(fadeInUp.hidden).toMatchObject({ opacity: 0, y: 20 });
    expect(fadeInUp.visible).toMatchObject({ opacity: 1, y: 0 });
    expect((fadeInUp.visible as { transition?: { duration?: number } }).transition?.duration).toBe(0.4);
    expect(fadeInUp.exit).toMatchObject({ opacity: 0, y: -10 });
  });

  it('scaleIn parte de 0.95 e chega a 1; slideInRight parte de x=20 e chega a 0', () => {
    expect((scaleIn.hidden as { scale?: number }).scale).toBe(0.95);
    expect((scaleIn.visible as { scale?: number }).scale).toBe(1);
    expect((slideInRight.hidden as { x?: number }).x).toBe(20);
    expect((slideInRight.visible as { x?: number }).x).toBe(0);
  });

  it('neonReveal anima o blur até 0px no estado final', () => {
    expect((neonReveal.hidden as { filter?: string }).filter).toBe('blur(10px)');
    expect((neonReveal.visible as { filter?: string }).filter).toBe('blur(0px)');
  });

  it('talkxStagger(delay) monta o container com staggerChildren = delay', () => {
    expect((talkxStagger(0.12).visible as { transition?: { staggerChildren?: number } }).transition?.staggerChildren).toBe(0.12);
    // valor padrão
    expect((talkxStagger().visible as { transition?: { staggerChildren?: number } }).transition?.staggerChildren).toBe(0.04);
  });

  // O "reduzir movimento" entra pela prefer├¬ncia do sistema (`matchMedia`) e o
  // app l├¬ isso pelo seam do framer. Prova que o seam enxerga a prefer├¬ncia no
  // ambiente do produto; somado ao teste acima (todo deslocamento volta a zero
  // no estado final), garante que neutralizar o movimento n├úo deixa nada
  // deslocado na tela.
  it('o seam useReducedMotion responde ├á prefer├¬ncia do sistema', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    function Sonda() {
      return <span data-testid="reduce">{String(useReducedMotion())}</span>;
    }
    render(<Sonda />);

    expect(screen.getByTestId('reduce')).toHaveTextContent('true');
  });
});
