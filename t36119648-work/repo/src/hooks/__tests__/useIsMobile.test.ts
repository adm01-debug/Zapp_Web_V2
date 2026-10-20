import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/ui/use-mobile';

describe('useIsMobile', () => {
  let addListenerSpy: ReturnType<typeof vi.fn>;
  let removeListenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addListenerSpy = vi.fn();
    removeListenerSpy = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: addListenerSpy,
        removeEventListener: removeListenerSpy,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('returns false for desktop width', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true for mobile width', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('returns false at exactly 768px (breakpoint)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true at 767px (just below breakpoint)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 767, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('registers change listener on matchMedia', () => {
    renderHook(() => useIsMobile());
    expect(addListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes listener on unmount', () => {
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(removeListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('responds to media query change events', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // Simulate resize to mobile
    const changeHandler = addListenerSpy.mock.calls[0][1];
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
      changeHandler();
    });
    expect(result.current).toBe(true);
  });

  it('handles very small widths', () => {
    Object.defineProperty(window, 'innerWidth', { value: 320, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('handles very large widths', () => {
    Object.defineProperty(window, 'innerWidth', { value: 3840, writable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
