import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useDebounce } from '@/hooks/system/useDebounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a debounced function', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 500));
    expect(typeof result.current).toBe('function');
  });

  it('does not call callback immediately', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 500));

    act(() => {
      result.current();
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it('calls callback after delay', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 500));

    act(() => {
      result.current();
    });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('resets timer on rapid calls', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current();
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('passes arguments to callback', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 200));

    act(() => {
      result.current('arg1', 'arg2');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(callback).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('only calls with last arguments on rapid calls', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 200));

    act(() => {
      result.current('first');
      result.current('second');
      result.current('third');
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('third');
  });

  // Correção (Unit Tests do CI): o disparo pendente tem de ser cancelado no desmontagem.
  // Sem isso, o temporizador de 300 ms da paleta de comandos dispara depois que o
  // componente/ambiente de teste já saiu e o callback roda sem jsdom ("window is not defined"),
  // deixando o vitest com erro não tratado e código de saída 1 mesmo com os testes verdes.
  it('não dispara o callback pendente depois que o componente desmonta', () => {
    const callback = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(callback, 300));

    act(() => {
      result.current('consulta');
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(callback).not.toHaveBeenCalled();
  });
});
