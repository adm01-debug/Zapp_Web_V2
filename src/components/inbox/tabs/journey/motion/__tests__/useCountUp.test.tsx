/**
 * J05 — `useCountUp`: contagem animada (rAF, 600 ms, ease-out) que termina no
 * valor EXATO, não deixa quadro pendente depois do desmonte e, com "reduzir
 * movimento", entrega o valor final na hora.
 *
 * Também as duas regras que a recusa da 1ª entrega pediu:
 *  - o alvo MUDA (41 → 42): a contagem parte do valor que está na tela, nunca
 *    de zero — o número não pode cair e subir de novo (item 4);
 *  - alvo INTEIRO conta inteiro: quadro intermediário arredondado, alvo final
 *    exato (item 5), e o arredondamento NÃO acontece com alvo fracionário
 *    (item 6), onde a fração é informação.
 *
 * O ponto de controle de "reduzir movimento" destes componentes é o hook
 * `useReducedMotion` do framer-motion (é ele que lê
 * `matchMedia('(prefers-reduced-motion: reduce)')` e avisa quando a preferência
 * muda) — por isso o mock está no hook, não no `matchMedia`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { COUNT_UP_DURATION_MS, useCountUp } from '../useCountUp';

const reduce = vi.hoisted(() => ({ value: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => reduce.value,
}));

const FAKE = ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] as const;

beforeEach(() => {
  reduce.value = false;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('J05 useCountUp', () => {
  it('(1) sai de zero, passa da metade antes da metade do tempo (ease-out) e fecha no valor exato', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { result } = renderHook(({ alvo }) => useCountUp(alvo), {
      initialProps: { alvo: 1000 },
    });

    expect(result.current).toBe(0);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBeGreaterThan(500);
    expect(result.current).toBeLessThan(1000);

    // passou do prazo: fecha no valor EXATO (nada de "quase 1000")
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(1000);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(1000);
  });

  it('(2) cancela o quadro pendente no desmonte', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const cancelar = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const { unmount } = renderHook(() => useCountUp(500));

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(cancelar).not.toHaveBeenCalled();

    unmount();
    expect(cancelar).toHaveBeenCalled();
  });

  it('(3) com reduzir movimento entrega o valor final na hora, sem pedir quadro', () => {
    reduce.value = true;
    const pedirQuadro = vi.spyOn(globalThis, 'requestAnimationFrame');
    const { result } = renderHook(() => useCountUp(42));

    expect(result.current).toBe(42);
    expect(pedirQuadro).not.toHaveBeenCalled();
  });

  it('(4) alvo novo parte do valor que está na tela: 10 → 12 nunca desce abaixo de 10 e fecha em 12', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { result, rerender } = renderHook(({ alvo }) => useCountUp(alvo), {
      initialProps: { alvo: 10 },
    });

    act(() => {
      vi.advanceTimersByTime(COUNT_UP_DURATION_MS + 100);
    });
    expect(result.current).toBe(10);

    // chegou uma mensagem: a estatística vai de 10 para 12 (era o caso que
    // derrubava o número para ~0 e o subia de novo)
    rerender({ alvo: 12 });

    const vistos: number[] = [result.current];
    // um passo por quadro de animação (16 ms): nenhum quadro escapa da prova
    for (let i = 0; i < 40; i += 1) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      vistos.push(result.current);
    }

    expect(vistos.every((v) => v >= 10)).toBe(true); // nada de cair para ~0
    expect(vistos.every((v) => v <= 12)).toBe(true); // e nada de passar do alvo
    expect(result.current).toBe(12); // fecha no alvo exato
  });

  it('(5) alvo inteiro conta inteiro: todo quadro intermediário é inteiro e o final é o alvo exato', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { result } = renderHook(() => useCountUp(923));

    const quadros: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      quadros.push(result.current);
    }

    // nenhum "523,47": com alvo inteiro, todo quadro sai inteiro (era o 2º defeito)
    expect(quadros.filter((v) => !Number.isInteger(v))).toEqual([]);
    expect(quadros.every((v) => v > 0 && v < 923)).toBe(true);

    act(() => {
      vi.advanceTimersByTime(COUNT_UP_DURATION_MS);
    });
    expect(result.current).toBe(923); // o arredondamento não encosta no alvo final
  });

  it('(6) alvo fracionário NÃO é arredondado (o arredondamento é condicional ao alvo inteiro)', () => {
    vi.useFakeTimers({ toFake: [...FAKE] });
    const { result } = renderHook(() => useCountUp(10.5));

    const quadros: number[] = [];
    for (let i = 0; i < 30; i += 1) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      quadros.push(result.current);
    }

    expect(quadros.some((v) => !Number.isInteger(v))).toBe(true);

    act(() => {
      vi.advanceTimersByTime(COUNT_UP_DURATION_MS);
    });
    expect(result.current).toBe(10.5);
  });
});
