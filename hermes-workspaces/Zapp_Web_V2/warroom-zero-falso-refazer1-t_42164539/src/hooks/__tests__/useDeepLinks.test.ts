import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeepLinks } from '@/hooks/ui/useDeepLinks';

describe('useDeepLinks', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  it('defaults to "inbox" when no hash', () => {
    const { result } = renderHook(() => useDeepLinks());
    expect(result.current.currentView).toBe('inbox');
  });

  it('uses custom default view', () => {
    const { result } = renderHook(() => useDeepLinks('dashboard'));
    expect(result.current.currentView).toBe('dashboard');
  });

  it('reads view from hash', () => {
    window.location.hash = '#contacts';
    const { result } = renderHook(() => useDeepLinks());
    expect(result.current.currentView).toBe('contacts');
  });

  it('navigateTo updates currentView', () => {
    const { result } = renderHook(() => useDeepLinks());
    act(() => {
      result.current.setCurrentView('settings');
    });
    expect(result.current.currentView).toBe('settings');
  });

  it('navigateTo updates window hash', () => {
    const { result } = renderHook(() => useDeepLinks());
    act(() => {
      result.current.setCurrentView('reports');
    });
    expect(window.location.hash).toBe('#reports');
  });

  it('responds to hashchange events', () => {
    const { result } = renderHook(() => useDeepLinks());
    act(() => {
      window.location.hash = '#queues';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.currentView).toBe('queues');
  });

  it('cleans up hashchange listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useDeepLinks());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('navigating multiple times tracks latest view', () => {
    const { result } = renderHook(() => useDeepLinks());
    act(() => { result.current.setCurrentView('a'); });
    act(() => { result.current.setCurrentView('b'); });
    act(() => { result.current.setCurrentView('c'); });
    expect(result.current.currentView).toBe('c');
  });

  it('handles empty hash as default', () => {
    window.location.hash = '#';
    const { result } = renderHook(() => useDeepLinks('inbox'));
    // empty string after # → defaults to 'inbox'
    expect(result.current.currentView).toBe('inbox');
  });
});
