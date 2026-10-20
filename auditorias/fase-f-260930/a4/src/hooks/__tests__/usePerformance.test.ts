import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { useDebounce, useThrottle } from '@/hooks/analytics/usePerformance';

describe('useDebounce (from usePerformance)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('debounces value changes', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    );

    rerender({ value: 'updated' });
    expect(result.current).toBe('initial');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('updated');
  });

  it('only takes last value during delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    rerender({ value: 'c' });
    rerender({ value: 'd' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('d');
  });

  it('works with number values', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: 0 } }
    );

    rerender({ value: 42 });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe(42);
  });

  it('works with object values', () => {
    const obj1 = { key: 'a' };
    const obj2 = { key: 'b' };

    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 200),
      { initialProps: { value: obj1 } }
    );

    rerender({ value: obj2 });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toEqual({ key: 'b' });
  });
});

describe('useThrottle (from usePerformance)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial value', () => {
    const { result } = renderHook(() => useThrottle('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('throttles rapid updates', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 300),
      { initialProps: { value: 'a' } }
    );

    rerender({ value: 'b' });
    rerender({ value: 'c' });

    // Should still be initial until throttle period passes
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('c');
  });
});
