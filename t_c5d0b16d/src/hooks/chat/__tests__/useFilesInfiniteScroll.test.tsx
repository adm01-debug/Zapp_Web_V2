import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useFilesInfiniteScroll } from '@/hooks/chat/useFilesInfiniteScroll';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

interface ObserverInstance {
  callback: ObserverCallback;
  observed: unknown[];
  disconnect: ReturnType<typeof vi.fn>;
}

const observers: ObserverInstance[] = [];

class IntersectionObserverStub implements ObserverInstance {
  callback: ObserverCallback;
  observed: unknown[] = [];
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor(callback: ObserverCallback) {
    this.callback = callback;
  }
  observe(el: unknown) {
    this.observed.push(el);
    observers.push(this);
  }
}

function lastObserver(): ObserverInstance | null {
  return observers.length > 0 ? observers[observers.length - 1] : null;
}

function sentinelRef() {
  const ref = createRef<HTMLDivElement>();
  // jsdom nao tem layout: o elemento existe como no real, o hook so observa.
  (ref as { current: HTMLDivElement }).current = document.createElement('div');
  return ref;
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFilesInfiniteScroll — sentinela do fim da lista (etapa 41)', () => {
  it('observa o sentinela quando ha mais paginas e dispara onLoadMore ao intersectar', () => {
    const onLoadMore = vi.fn();
    const ref = sentinelRef();
    renderHook(() => useFilesInfiniteScroll(ref, { hasMore: true, isFetching: false, onLoadMore }));

    const observer = lastObserver();
    expect(observer).not.toBeNull();
    expect(observer!.observed).toContain(ref.current);

    observer!.callback([{ isIntersecting: false }]);
    expect(onLoadMore).not.toHaveBeenCalled();

    observer!.callback([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('nao dispara enquanto uma pagina ja esta em voo', () => {
    const onLoadMore = vi.fn();
    const ref = sentinelRef();
    renderHook(() => useFilesInfiniteScroll(ref, { hasMore: true, isFetching: true, onLoadMore }));

    lastObserver()!.callback([{ isIntersecting: true }]);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('sem proxima pagina, nem cria observer', () => {
    const onLoadMore = vi.fn();
    const ref = sentinelRef();
    renderHook(() => useFilesInfiniteScroll(ref, { hasMore: false, isFetching: false, onLoadMore }));

    expect(lastObserver()).toBeNull();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('desconecta o observer na desmontagem', () => {
    const onLoadMore = vi.fn();
    const ref = sentinelRef();
    const { unmount } = renderHook(() => useFilesInfiniteScroll(ref, { hasMore: true, isFetching: false, onLoadMore }));

    const observer = lastObserver()!;
    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
  });
});
