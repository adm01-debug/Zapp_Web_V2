import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useParallax, useMouseParallax, useSmoothScroll } from '@/hooks/ui/useParallax';

describe('useParallax', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with zero offset', () => {
    const { result } = renderHook(() => useParallax());
    expect(result.current.offset).toBe(0);
  });

  it('initializes scrollProgress at zero', () => {
    const { result } = renderHook(() => useParallax());
    expect(result.current.scrollProgress.progress).toBe(0);
    expect(result.current.scrollProgress.direction).toBe('none');
    expect(result.current.scrollProgress.velocity).toBe(0);
  });

  it('getTransform returns translateY by default', () => {
    const { result } = renderHook(() => useParallax());
    expect(result.current.getTransform()).toContain('translateY');
  });

  it('getTransform returns translateX for horizontal', () => {
    const { result } = renderHook(() => useParallax({ direction: 'horizontal' }));
    expect(result.current.getTransform()).toContain('translateX');
  });

  it('accepts custom speed', () => {
    const { result } = renderHook(() => useParallax({ speed: 1.5 }));
    expect(result.current.offset).toBe(0);
  });

  it('registers scroll listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useParallax());
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true });
    addSpy.mockRestore();
  });

  it('cleans up scroll listener', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useParallax());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    removeSpy.mockRestore();
  });
});

describe('useMouseParallax', () => {
  it('initializes at {x: 0, y: 0}', () => {
    const { result } = renderHook(() => useMouseParallax());
    expect(result.current.x).toBe(0);
    expect(result.current.y).toBe(0);
  });

  it('accepts custom intensity', () => {
    const { result } = renderHook(() => useMouseParallax(0.05));
    expect(result.current.x).toBe(0);
  });

  it('registers mousemove listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useMouseParallax());
    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true });
    addSpy.mockRestore();
  });

  it('cleans up listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useMouseParallax());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    removeSpy.mockRestore();
  });
});

describe('useSmoothScroll', () => {
  it('returns scrollTo function', () => {
    const { result } = renderHook(() => useSmoothScroll());
    expect(typeof result.current.scrollTo).toBe('function');
  });

  it('scrollTo does not throw for missing element', () => {
    const { result } = renderHook(() => useSmoothScroll());
    expect(() => result.current.scrollTo('nonexistent')).not.toThrow();
  });

  it('scrollTo accepts offset parameter', () => {
    const { result } = renderHook(() => useSmoothScroll());
    expect(() => result.current.scrollTo('id', 50)).not.toThrow();
  });
});
