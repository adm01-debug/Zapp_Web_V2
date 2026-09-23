import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderHook, render, act } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  usePrefetch,
  useRoutePrefetch,
  useImagePrefetch,
  useCriticalDataPrefetch,
  useIntersectionPrefetch,
  clearPrefetchCache,
  getPrefetchedData,
} from '@/hooks/system/useResourcePrefetch';

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

  it('does not return data to a caller that unmounted while the fetch was in flight, but still populates the global cache', async () => {
    let resolveFetch: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveFetch = resolve;
    });

    const { result, unmount } = renderHook(() => usePrefetch('key11', () => pending));

    let data: string | null = 'not-set';
    const prefetchDone = result.current.prefetch().then((d) => {
      data = d;
    });

    unmount();
    resolveFetch!('data-after-unmount');
    await act(async () => {
      await prefetchDone;
    });

    expect(data).toBeNull();
    expect(getPrefetchedData('key11')).toBe('data-after-unmount');
  });

  it('a follower call does not leak data to a caller that unmounted, even while the leader stays mounted', async () => {
    let resolveFetch: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveFetch = resolve;
    });
    const fetcher = vi.fn(() => pending);

    const leader = renderHook(() => usePrefetch('key12', fetcher));
    const follower = renderHook(() => usePrefetch('key12', fetcher));

    let leaderData: string | null = 'not-set';
    let followerData: string | null = 'not-set';
    const leaderDone = leader.result.current.prefetch().then((d) => { leaderData = d; });
    const followerDone = follower.result.current.prefetch().then((d) => { followerData = d; });

    follower.unmount();
    resolveFetch!('shared-data');
    await act(async () => {
      await Promise.all([leaderDone, followerDone]);
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(leaderData).toBe('shared-data');
    expect(followerData).toBeNull();
    expect(getPrefetchedData('key12')).toBe('shared-data');
  });

  it('a follower call resolves to null instead of rejecting when the shared fetch fails', async () => {
    let rejectFetch: (error: Error) => void;
    const pending = new Promise<string>((_resolve, reject) => {
      rejectFetch = reject;
    });
    const fetcher = vi.fn(() => pending);

    const leader = renderHook(() => usePrefetch('key13', fetcher));
    const follower = renderHook(() => usePrefetch('key13', fetcher));

    const leaderDone = leader.result.current.prefetch();
    const followerDone = follower.result.current.prefetch();

    rejectFetch!(new Error('fail'));
    const [leaderData, followerData] = await act(async () => Promise.all([leaderDone, followerDone]));

    expect(leaderData).toBeNull();
    expect(followerData).toBeNull();
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

  it('cancels fallback prefetch when the hook unmounts', () => {
    vi.useFakeTimers();
    try {
      const { result, unmount } = renderHook(() => useRoutePrefetch());
      const before = document.head.querySelectorAll('link[rel="prefetch"]').length;

      act(() => result.current.prefetchRoute('/cancelled-after-unmount'));
      unmount();
      act(() => vi.runAllTimers());

      expect(document.head.querySelectorAll('link[rel="prefetch"]')).toHaveLength(before);
    } finally {
      vi.useRealTimers();
    }
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

describe('useCriticalDataPrefetch', () => {
  const originalRequestIdleCallback = window.requestIdleCallback;
  const originalCancelIdleCallback = window.cancelIdleCallback;

  beforeEach(() => {
    clearPrefetchCache();
  });

  afterEach(() => {
    if (originalRequestIdleCallback) {
      window.requestIdleCallback = originalRequestIdleCallback;
    } else {
      delete (window as unknown as Record<string, unknown>).requestIdleCallback;
    }
    if (originalCancelIdleCallback) {
      window.cancelIdleCallback = originalCancelIdleCallback;
    } else {
      delete (window as unknown as Record<string, unknown>).cancelIdleCallback;
    }
  });

  it('prefetches all fetchers on idle and stores them in the shared cache', async () => {
    let idleCallback: (() => void) | undefined;
    window.requestIdleCallback = vi.fn((cb: () => void) => {
      idleCallback = cb;
      return 1;
    }) as unknown as typeof window.requestIdleCallback;
    window.cancelIdleCallback = vi.fn();

    const fetchers = [
      { key: 'critical1', fetch: vi.fn().mockResolvedValue('a') },
      { key: 'critical2', fetch: vi.fn().mockResolvedValue('b') },
    ];

    renderHook(() => useCriticalDataPrefetch(fetchers));
    expect(idleCallback).toBeDefined();

    await act(async () => {
      idleCallback!();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getPrefetchedData('critical1')).toBe('a');
    expect(getPrefetchedData('critical2')).toBe('b');
  });

  it('cancels the scheduled idle callback on unmount', () => {
    window.requestIdleCallback = vi.fn(() => 42) as unknown as typeof window.requestIdleCallback;
    const cancelSpy = vi.fn();
    window.cancelIdleCallback = cancelSpy;

    const fetchers = [{ key: 'critical3', fetch: vi.fn().mockResolvedValue('c') }];

    const { unmount } = renderHook(() => useCriticalDataPrefetch(fetchers));
    unmount();

    expect(cancelSpy).toHaveBeenCalledWith(42);
  });

  it('stops writing to the cache if the component unmounts mid-fetch', async () => {
    let idleCallback: (() => void) | undefined;
    window.requestIdleCallback = vi.fn((cb: () => void) => {
      idleCallback = cb;
      return 1;
    }) as unknown as typeof window.requestIdleCallback;
    window.cancelIdleCallback = vi.fn();

    let resolveFetch: (value: string) => void;
    const pending = new Promise<string>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchers = [{ key: 'critical4', fetch: () => pending }];

    const { unmount } = renderHook(() => useCriticalDataPrefetch(fetchers));
    idleCallback!();
    unmount();
    resolveFetch!('late-data');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getPrefetchedData('critical4')).toBeUndefined();
  });
});

describe('useIntersectionPrefetch', () => {
  const originalIntersectionObserver = (globalThis as Record<string, unknown>).IntersectionObserver;

  afterEach(() => {
    (globalThis as Record<string, unknown>).IntersectionObserver = originalIntersectionObserver;
  });

  it('does not call the fetcher on intersection after the component has unmounted', () => {
    let observedCallback: IntersectionObserverCallback | undefined;
    class FakeIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        observedCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    (globalThis as Record<string, unknown>).IntersectionObserver = FakeIntersectionObserver;

    const fetcher = vi.fn().mockResolvedValue('data');

    function TestComponent() {
      const ref = useIntersectionPrefetch(fetcher);
      return React.createElement('div', { ref });
    }

    const { unmount } = render(React.createElement(TestComponent));
    expect(observedCallback).toBeDefined();

    unmount();

    act(() => {
      observedCallback!(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls the fetcher on intersection while still mounted', () => {
    let observedCallback: IntersectionObserverCallback | undefined;
    class FakeIntersectionObserver {
      constructor(cb: IntersectionObserverCallback) {
        observedCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    (globalThis as Record<string, unknown>).IntersectionObserver = FakeIntersectionObserver;

    const fetcher = vi.fn().mockResolvedValue('data');

    function TestComponent() {
      const ref = useIntersectionPrefetch(fetcher);
      return React.createElement('div', { ref });
    }

    render(React.createElement(TestComponent));

    act(() => {
      observedCallback!(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
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
