import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useKeyboardHeight } from '../useKeyboardHeight';

type Listener = () => void;

/** visualViewport falso com registro de listeners: deixa disparar resize/scroll à mão. */
function installVisualViewport(initialHeight: number, innerHeight: number) {
  const listeners = new Map<string, Set<Listener>>();
  const viewport = {
    height: initialHeight,
    addEventListener: vi.fn((type: string, cb: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    }),
    removeEventListener: vi.fn((type: string, cb: Listener) => {
      listeners.get(type)?.delete(cb);
    }),
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });

  const fire = (type: string, height: number) => {
    viewport.height = height;
    listeners.get(type)?.forEach((cb) => cb());
  };
  return { viewport, fire };
}

describe('useKeyboardHeight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error limpa o global falso entre testes
    delete window.visualViewport;
  });

  it('começa fechado e não falha sem a Visual Viewport API', () => {
    // @ts-expect-error ausência proposital da API em navegador antigo
    delete window.visualViewport;
    const { result } = renderHook(() => useKeyboardHeight());
    expect(result.current).toEqual({ keyboardHeight: 0, isKeyboardOpen: false });
  });

  it('mede a altura do teclado pela diferença innerHeight - visualViewport.height', () => {
    const { fire } = installVisualViewport(800, 800);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => fire('resize', 500));
    expect(result.current.keyboardHeight).toBe(300);
    expect(result.current.isKeyboardOpen).toBe(true);
  });

  it('trata o limite de 50px: exatamente 50 fecha, 51 abre', () => {
    const { fire } = installVisualViewport(800, 800);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => fire('resize', 750)); // diff 50
    expect(result.current.isKeyboardOpen).toBe(false);

    act(() => fire('resize', 749)); // diff 51
    expect(result.current.isKeyboardOpen).toBe(true);
  });

  it('nunca devolve altura negativa (viewport maior que a janela)', () => {
    const { fire } = installVisualViewport(800, 800);
    const { result } = renderHook(() => useKeyboardHeight());

    act(() => fire('scroll', 900));
    expect(result.current.keyboardHeight).toBe(0);
    expect(result.current.isKeyboardOpen).toBe(false);
  });

  it('remove os listeners de resize e scroll ao desmontar', () => {
    const { viewport } = installVisualViewport(800, 800);
    const { unmount } = renderHook(() => useKeyboardHeight());

    unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(viewport.removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function));
  });
});
