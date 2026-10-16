import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { usePushNotifications } from '@/hooks/system/usePushNotifications';

describe('usePushNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes requestPermission function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.requestPermission).toBe('function');
  });

  it('exposes subscribe function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.subscribe).toBe('function');
  });

  it('exposes unsubscribe function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.unsubscribe).toBe('function');
  });

  it('exposes showNotification function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.showNotification).toBe('function');
  });

  it('exposes toggleSubscription function', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.toggleSubscription).toBe('function');
  });

  it('initializes isSubscribed as false', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSubscribed).toBe(false);
  });

  it('has permission property', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.permission).toBeDefined();
  });

  it('has isSupported property', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(typeof result.current.isSupported).toBe('boolean');
  });

  it('does not wait for serviceWorker.ready while the feature is disabled', async () => {
    const readyGetter = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: Object.defineProperty({}, 'ready', { get: readyGetter }),
    });
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: class PushManager {},
    });

    const { result } = renderHook(() => usePushNotifications());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.isSupported).toBe(false);
    expect(readyGetter).not.toHaveBeenCalled();
  });

  it('fails disabled operations immediately without touching the Service Worker', async () => {
    const readyGetter = vi.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: Object.defineProperty({}, 'ready', { get: readyGetter }),
    });
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.requestPermission()).resolves.toBe(false);
      await expect(result.current.subscribe()).resolves.toBeNull();
      await expect(result.current.unsubscribe()).resolves.toBe(false);
      await expect(result.current.showNotification({ title: 'test', body: 'test' }))
        .resolves.toBe(false);
    });

    expect(readyGetter).not.toHaveBeenCalled();
  });
});
