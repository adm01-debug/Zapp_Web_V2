import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useViewTransition } from '../useViewTransition';

function stubStartViewTransition(value: unknown) {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    writable: true,
    value,
  });
}

function cleanup() {
  Reflect.deleteProperty(document, 'startViewTransition');
}

describe('useViewTransition', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('sem suporte à API, executa o callback direto (fallback)', () => {
    cleanup();
    const { result } = renderHook(() => useViewTransition());
    const callback = vi.fn();

    result.current.startTransition(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('com suporte, entrega o callback à API e não o chama por conta própria', () => {
    let received: (() => void) | undefined;
    const callback = vi.fn();
    const startViewTransition = vi.fn((cb: () => void) => {
      received = cb;
      return {
        finished: { catch: vi.fn() },
        ready: { catch: vi.fn() },
        updateCallbackDone: { catch: vi.fn() },
      };
    });
    stubStartViewTransition(startViewTransition);

    const { result } = renderHook(() => useViewTransition());
    result.current.startTransition(callback);

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(callback).not.toHaveBeenCalled();

    // A API é quem chama o callback quando a transição começa.
    received!();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('silencia as três promises da transição (navegação rápida aborta)', () => {
    const finished = { catch: vi.fn() };
    const ready = { catch: vi.fn() };
    const updateCallbackDone = { catch: vi.fn() };
    stubStartViewTransition(() => ({ finished, ready, updateCallbackDone }));

    const { result } = renderHook(() => useViewTransition());
    result.current.startTransition(() => {});

    expect(finished.catch).toHaveBeenCalledTimes(1);
    expect(ready.catch).toHaveBeenCalledTimes(1);
    expect(updateCallbackDone.catch).toHaveBeenCalledTimes(1);
  });
});
