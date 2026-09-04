import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDebounce } from './useDebounce';

describe('useDebounce hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debounces a function call', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 500));
    
    const debouncedFn = result.current;

    // Call the function
    debouncedFn('test');
    
    // Should not have been called yet
    expect(callback).not.toHaveBeenCalled();

    // Fast-forward time
    vi.advanceTimersByTime(500);

    // Should have been called now
    expect(callback).toHaveBeenCalledWith('test');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cancels previous calls if called multiple times within delay', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useDebounce(callback, 500));
    
    const debouncedFn = result.current;

    // Call multiple times
    debouncedFn(1);
    vi.advanceTimersByTime(250);
    debouncedFn(2);
    vi.advanceTimersByTime(250);
    debouncedFn(3);
    
    // Still not called
    expect(callback).not.toHaveBeenCalled();

    // Fast-forward remaining time for the last call
    vi.advanceTimersByTime(500);

    // Only the last call should be executed
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(3);
  });
});
