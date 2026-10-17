import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => {
  const makeLogger = () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withCorrelation: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  });
  const logger = makeLogger();
  return {
    createLogger: vi.fn(() => makeLogger()),
    getLogger: vi.fn(() => makeLogger()),
    logger,
    log: logger,
    generateCorrelationId: vi.fn((prefix = 'req') => `${prefix}_mock_0`),
    getSessionId: vi.fn(() => 'mock-session-id'),
    logPerformance: vi.fn((_label, fn) => fn()),
    logAsyncPerformance: vi.fn(async (_label, fn) => fn()),
  };
});

import {
  useThrottledCallback,
  useIdleCallback,
  useMemoryPressure,
  useNetworkStatus,
  useReducedMotion,
} from '@/hooks/analytics/usePerformanceOptimizations';

describe('useThrottledCallback', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls callback immediately on first call', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 100));
    act(() => { result.current(); });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('throttles subsequent calls', () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(callback, 100));
    act(() => { result.current(); });
    act(() => { result.current(); });
    expect(callback).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(100); });
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

describe('useIdleCallback', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls callback via setTimeout fallback', () => {
    const callback = vi.fn();
    renderHook(() => useIdleCallback(callback, 500));
    act(() => { vi.advanceTimersByTime(500); });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useIdleCallback(callback, 500));
    unmount();
    act(() => { vi.advanceTimersByTime(500); });
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('useMemoryPressure', () => {
  it('returns boolean', () => {
    const { result } = renderHook(() => useMemoryPressure());
    expect(typeof result.current).toBe('boolean');
  });
});

describe('useNetworkStatus', () => {
  it('returns isOnline', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('returns connectionType', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(typeof result.current.connectionType).toBe('string');
  });

  it('returns isSlowConnection', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(typeof result.current.isSlowConnection).toBe('boolean');
  });

  it('handles online/offline events', () => {
    const { result } = renderHook(() => useNetworkStatus());
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(result.current.isOnline).toBe(false);
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(result.current.isOnline).toBe(true);
  });
});

describe('useReducedMotion', () => {
  it('returns boolean', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    const { result } = renderHook(() => useReducedMotion());
    expect(typeof result.current).toBe('boolean');
  });
});
