/**
 * AnimatedCounter e Typewriter — defeitos de movimento.
 *
 * 1) O contador guardava o valor anterior num objeto recriado a cada render
 *    (`const prevRef = { current: 0 }`), então toda mudança de valor animava
 *    de 0; agora o valor anterior vem de um `useRef` estável.
 * 2) O Typewriter reiniciava o efeito a cada render (identidade de
 *    `onComplete` nas deps) e ignorava o reduzir movimento.
 *
 * O framer-motion é substituído por um passe-plataforma determinístico: o
 * teste mede a lógica do contador, não o runtime de animação.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const reduzido = { value: false };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  const propsDeMovimento = new Set([
      'initial', 'animate', 'exit', 'transition', 'variants', 'whileHover',
      'whileTap', 'whileFocus', 'layout', 'layoutId', 'drag', 'onAnimationComplete',
    ]);
    const cache = new Map<string, (props: Record<string, unknown>) => ReactNode>();
    const motion = new Proxy({} as Record<string, unknown>, {
      get(_target, tag: string) {
        if (typeof tag !== 'string') return undefined;
        if (!cache.has(tag)) {
          cache.set(tag, (props: Record<string, unknown>) => {
            const limpos: Record<string, unknown> = {};
            for (const [chave, valor] of Object.entries(props)) {
              if (!propsDeMovimento.has(chave)) limpos[chave] = valor;
            }
            return createElement(tag, limpos, props.children as ReactNode);
          });
        }
        return cache.get(tag);
      },
    });
  return {
    ...actual,
    motion, AnimatePresence: ({ children }: { children: ReactNode }) => children, Variants: undefined, useReducedMotion: () => reduzido.value
  };
});

import { AnimatedCounter, Typewriter } from '@/components/ui/motion/effects';

type Quadro = (ts: number) => void;
let fila: Quadro[] = [];

const quadros = (ts: number) => {
  const atuais = fila;
  fila = [];
  act(() => {
    atuais.forEach((cb) => cb(ts));
  });
};

beforeEach(() => {
  fila = [];
  vi.stubGlobal('requestAnimationFrame', (cb: Quadro) => {
    fila.push(cb);
    return fila.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  reduzido.value = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('AnimatedCounter', () => {
  it('1. conta do ZERO até o valor na primeira montagem', () => {
    render(<AnimatedCounter value={10} duration={1} />);
    quadros(1000);
    quadros(2000);

    expect(screen.getByText('10')).toBeTruthy();
  });

  it('2. ao mudar o valor, anima do valor ANTERIOR (não reinicia do zero)', () => {
    const { rerender } = render(<AnimatedCounter value={10} duration={1} />);
    quadros(1000);
    quadros(2000);
    expect(screen.getByText('10')).toBeTruthy();

    rerender(<AnimatedCounter value={20} duration={1} />);
    quadros(3000);
    quadros(3500);

    // 10 + (20-10) * ease(0.5) = 10 + 10*0.875 = 18.75 -> 19.
    // Com o bug antigo (start=0) daria 0 + 20*0.875 = 17.5 -> 18.
    expect(screen.getByText('19')).toBeTruthy();
  });

  it('3. re-renderizar com o MESMO valor não reagenda animação', () => {
    const { rerender } = render(<AnimatedCounter value={7} duration={1} />);
    quadros(1000);
    quadros(2000);
    expect(screen.getByText('7')).toBeTruthy();

    fila = [];
    rerender(<AnimatedCounter value={7} duration={1} />);

    expect(fila).toHaveLength(0);
    expect(screen.getByText('7')).toBeTruthy();
  });
});

describe('Typewriter', () => {
  it('4. com movimento reduzido mostra o texto inteiro de uma vez e avisa o fim', () => {
    reduzido.value = true;
    const aoCompletar = vi.fn();

    render(<Typewriter text="Pronto" speed={10} onComplete={aoCompletar} />);

    expect(screen.getByText('Pronto')).toBeTruthy();
    expect(aoCompletar).toHaveBeenCalledTimes(1);
  });

  it('5. trocar a identidade de onComplete NÃO reinicia a digitação', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Typewriter text="abc" speed={10} onComplete={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(screen.getByText('ab')).toBeTruthy();

    // Callback novo a cada render (arrow inline) — no código antigo isso
    // reiniciava o efeito e o texto voltava para "".
    rerender(<Typewriter text="abc" speed={10} onComplete={() => {}} />);

    act(() => {
      vi.advanceTimersByTime(10);
    });

    expect(screen.getByText('abc')).toBeTruthy();
  });
});
