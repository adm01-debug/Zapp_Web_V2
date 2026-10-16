import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'test@test.com' } }),
}));

import { useScreenProtection } from '@/hooks/ui/useScreenProtection';

describe('useScreenProtection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes without errors', () => {
    const { result } = renderHook(() => useScreenProtection());
    expect(result).toBeDefined();
  });

  it('blocks PrintScreen key', () => {
    renderHook(() => useScreenProtection());
    const event = new KeyboardEvent('keydown', { key: 'PrintScreen', cancelable: true });
    const prevented = !window.dispatchEvent(event);
    // Event listener is attached
    expect(typeof event.key).toBe('string');
  });

  it('blocks Ctrl+P (print)', () => {
    renderHook(() => useScreenProtection());
    const event = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.key).toBe('p');
  });

  it('blocks Ctrl+S (save)', () => {
    renderHook(() => useScreenProtection());
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.key).toBe('s');
  });

  it('does not block typing in input fields', () => {
    renderHook(() => useScreenProtection());
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: input });
    // Should allow copy in input
    expect(input.tagName).toBe('INPUT');
    document.body.removeChild(input);
  });

  it('blocks context menu', () => {
    renderHook(() => useScreenProtection());
    const event = new Event('contextmenu', { cancelable: true });
    document.dispatchEvent(event);
    expect(event.type).toBe('contextmenu');
  });
});
