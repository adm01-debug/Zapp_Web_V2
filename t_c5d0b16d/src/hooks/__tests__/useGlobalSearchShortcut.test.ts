import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobalSearchShortcut } from '@/hooks/ui/useGlobalSearchShortcut';

describe('useGlobalSearchShortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onOpen when Ctrl+K pressed', () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut({ onOpen }));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen when Cmd+K pressed', () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut({ onOpen }));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not call onOpen for plain K', () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut({ onOpen }));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not call onOpen for Ctrl+other key', () => {
    const onOpen = vi.fn();
    renderHook(() => useGlobalSearchShortcut({ onOpen }));
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('cleans up event listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useGlobalSearchShortcut({ onOpen: vi.fn() }));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
