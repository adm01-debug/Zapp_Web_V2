/**
 * J05 — `useCountUp`: contagem animada (rAF, 600 ms, ease-out) que termina no
 * valor EXATO, não deixa quadro pendente depois do desmonte e, com "reduzir
 * movimento", entrega o valor final na hora.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCountUp } from '../useCountUp';

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
});
