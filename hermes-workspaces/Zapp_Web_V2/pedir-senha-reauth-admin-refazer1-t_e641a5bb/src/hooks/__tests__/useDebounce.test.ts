import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
});

describe('useDebounce — desmontagem', () => {
  it('não dispara o callback pendente depois que o componente desmonta', () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(cb, 300));
    result.current('x');
    unmount();
    vi.advanceTimersByTime(1000);
    expect(cb).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('useDebounce — suíte única para este hook', () => {
  // O defeito (cartão SL-222): existia um segundo arquivo de teste deste hook ao lado do código
  // (`src/hooks/system/useDebounce.test.ts`), coletado também pelo `include` do vitest.config.ts,
  // o que rodava as mesmas verificações duas vezes por build. Esta guarda trava a volta da duplicata.
  const canonico = join(process.cwd(), 'src', 'hooks', '__tests__', 'useDebounce.test.ts');
  const duplicado = join(process.cwd(), 'src', 'hooks', 'system', 'useDebounce.test.ts');

  it('a varredura enxerga os dois caminhos (não passa por vacuidade) e o duplicado não existe', () => {
    expect(existsSync(canonico)).toBe(true);
    expect(existsSync(duplicado)).toBe(false);
  });

  it('mantém aqui a cobertura que a duplicata removida tinha, chamando o hook real', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 500));

    // Mesma sequência do arquivo removido: 250 + 250 + 500.
    result.current(1);
    vi.advanceTimersByTime(250);
    result.current(2);
    vi.advanceTimersByTime(250);
    result.current(3);

    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });
});
