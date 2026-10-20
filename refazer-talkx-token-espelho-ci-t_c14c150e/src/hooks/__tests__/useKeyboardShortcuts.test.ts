import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/hooks/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

import { useKeyboardShortcuts } from '@/hooks/ui/useKeyboardShortcuts';

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers action on matching key', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      shortcuts: [{ key: 'a', description: 'test', action }],
    }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('triggers action with Ctrl modifier', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      shortcuts: [{ key: 'k', ctrlKey: true, description: 'test', action }],
    }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not trigger without correct modifier', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      shortcuts: [{ key: 'k', ctrlKey: true, description: 'test', action }],
    }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(action).not.toHaveBeenCalled();
  });

  it('does not trigger when disabled', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      shortcuts: [{ key: 'a', description: 'test', action }],
      enabled: false,
    }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    expect(action).not.toHaveBeenCalled();
  });

  it('supports Shift modifier', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      shortcuts: [{ key: 'r', ctrlKey: true, shiftKey: true, description: 'test', action }],
    }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, shiftKey: true }));
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('supports Alt modifier', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      shortcuts: [{ key: 'n', altKey: true, description: 'test', action }],
    }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', altKey: true }));
    });
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyboardShortcuts({
      shortcuts: [{ key: 'a', description: 'test', action: vi.fn() }],
    }));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('is case-insensitive for key matching', () => {
    const action = vi.fn();
    renderHook(() => useKeyboardShortcuts({
      shortcuts: [{ key: 'A', description: 'test', action }],
    }));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    });
    expect(action).toHaveBeenCalledTimes(1);
  });
});
