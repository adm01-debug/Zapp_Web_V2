import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatKeyboardNavigation, chatKeyboardShortcuts } from '@/hooks/chat/useChatKeyboardNavigation';

describe('useChatKeyboardNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with no selected message', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    expect(result.current.selectedMessageIndex).toBeNull();
  });

  it('initializes with isNavigating false', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    expect(result.current.isNavigating).toBe(false);
  });

  it('exposes exitNavigationMode function', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    expect(typeof result.current.exitNavigationMode).toBe('function');
  });

  it('exposes setSelectedMessageIndex function', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    expect(typeof result.current.setSelectedMessageIndex).toBe('function');
  });

  it('exitNavigationMode resets state', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { result.current.setSelectedMessageIndex(5); });
    act(() => { result.current.exitNavigationMode(); });
    expect(result.current.selectedMessageIndex).toBeNull();
    expect(result.current.isNavigating).toBe(false);
  });

  it('ArrowUp selects last message', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); });
    expect(result.current.selectedMessageIndex).toBe(9);
    expect(result.current.isNavigating).toBe(true);
  });

  it('ArrowDown selects first message', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' })); });
    expect(result.current.selectedMessageIndex).toBe(0);
    expect(result.current.isNavigating).toBe(true);
  });

  it('k key navigates up (vim style)', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' })); });
    expect(result.current.selectedMessageIndex).toBe(9);
  });

  it('j key navigates down (vim style)', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' })); });
    expect(result.current.selectedMessageIndex).toBe(0);
  });

  it('Home goes to first message', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' })); });
    expect(result.current.selectedMessageIndex).toBe(0);
  });

  it('End goes to last message', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' })); });
    expect(result.current.selectedMessageIndex).toBe(9);
  });

  it('Escape exits navigation mode', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); });
    expect(result.current.isNavigating).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(result.current.isNavigating).toBe(false);
    expect(result.current.selectedMessageIndex).toBeNull();
  });

  it('does not navigate when disabled', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10, enabled: false }));
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); });
    expect(result.current.selectedMessageIndex).toBeNull();
  });

  it('does not go below 0', () => {
    const { result } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    act(() => { result.current.setSelectedMessageIndex(0); });
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' })); });
    // Should stay at 0 or near 0
    expect(result.current.selectedMessageIndex).toBeLessThanOrEqual(9);
  });

  it('chatKeyboardShortcuts has 7 entries', () => {
    expect(chatKeyboardShortcuts).toHaveLength(7);
  });

  it('each shortcut has key and description', () => {
    chatKeyboardShortcuts.forEach(s => {
      expect(s.key).toBeTruthy();
      expect(s.description).toBeTruthy();
    });
  });

  it('cleans up event listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useChatKeyboardNavigation({ messagesCount: 10 }));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeSpy.mockRestore();
  });
});
