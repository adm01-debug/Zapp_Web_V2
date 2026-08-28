import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { usePrefetch, useRoutePrefetch, useImagePrefetch, clearPrefetchCache, getPrefetchedData } from '@/hooks/system/useResourcePrefetch';

describe('usePrefetch', () => {
  beforeEach(() => {
    clearPrefetchCache();
  });

  it('exposes prefetch function', () => {
    const { result } = renderHook(() => usePrefetch('key1', () => Promise.resolve('data')));
    expect(typeof result.current.prefetch).toBe('function');
  });

  it('exposes schedulePrefetch function', () => {
    const { result } = renderHook(() => usePrefetch('key2', () => Promise.resolve('data')));
    expect(typeof result.current.schedulePrefetch).toBe('function');
  });

  it('exposes cancelPrefetch function', () => {
    const { result } = renderHook(() => usePrefetch('key3', () => Promise.resolve('data')));
    expect(typeof result.current.cancelPrefetch).toBe('function');
  });

  it('exposes getCached function', () => {
    const { result } = renderHook(() => usePrefetch('key4', () => Promise.resolve('data')));
    expect(typeof result.current.getCached).toBe('function');
  });

  it('exposes isCached function', () => {
    const { result } = renderHook(() => usePrefetch('key5', () => Promise.resolve('data')));
    expect(typeof result.current.isCached).toBe('function');
  });

  it('getCached returns undefined before prefetch', () => {
    const { result } = renderHook(() => usePrefetch('key6', () => Promise.resolve('data')));
    expect(result.current.getCached()).toBeUndefined();
  });

  it('isCached returns false before prefetch', () => {
    const { result } = renderHook(() => usePrefetch('key7', () => Promise.resolve('data')));
    expect(result.current.isCached()).toBe(false);
  });

  it('prefetch stores data in cache', async () => {
    const { result } = renderHook(() => usePrefetch('key8', () => Promise.resolve('cached-data')));
    await act(async () => {
      await result.current.prefetch();
    });
    expect(result.current.getCached()).toBe('cached-data');
    expect(result.current.isCached()).toBe(true);
  });

  it('returns cached data on second call', async () => {
    const fetcher = vi.fn().mockResolvedValue('data');
    const { result } = renderHook(() => usePrefetch('key9', fetcher));
    await act(async () => { await result.current.prefetch(); });
    await act(async () => { await result.current.prefetch(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('handles fetcher error gracefully', async () => {
    const { result } = renderHook(() => usePrefetch('key10', () => Promise.reject(new Error('fail'))));
    const data = await act(async () => result.current.prefetch());
    expect(data).toBeNull();
  });
});

describe('useRoutePrefetch', () => {
  it('exposes prefetchRoute function', () => {
    const { result } = renderHook(() => useRoutePrefetch());
    expect(typeof result.current.prefetchRoute).toBe('function');
  });

  it('prefetchRoute does not throw', () => {
    const { result } = renderHook(() => useRoutePrefetch());
    expect(() => result.current.prefetchRoute('/test')).not.toThrow();
  });
});

describe('useImagePrefetch', () => {
  it('exposes prefetchImage function', () => {
    const { result } = renderHook(() => useImagePrefetch());
    expect(typeof result.current.prefetchImage).toBe('function');
  });

  it('exposes prefetchImages function', () => {
    const { result } = renderHook(() => useImagePrefetch());
    expect(typeof result.current.prefetchImages).toBe('function');
  });
});

describe('clearPrefetchCache', () => {
  it('clears all cached data', async () => {
    const { result } = renderHook(() => usePrefetch('cleartest', () => Promise.resolve('data')));
    await act(async () => { await result.current.prefetch(); });
    expect(result.current.isCached()).toBe(true);
    clearPrefetchCache();
    expect(result.current.isCached()).toBe(false);
  });
});

describe('getPrefetchedData', () => {
  it('returns undefined for missing key', () => {
    expect(getPrefetchedData('nonexistent')).toBeUndefined();
  });
});
