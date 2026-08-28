import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const mockUnregister = vi.fn().mockResolvedValue(true);
const mockCaches = {
  keys: vi.fn().mockResolvedValue([]),
  delete: vi.fn().mockResolvedValue(true),
};

const mockRegistration = {
  scope: '/',
  update: vi.fn(),
  installing: null,
  addEventListener: vi.fn(),
};

describe('useServiceWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    sessionStorage.clear();

    Object.defineProperty(globalThis, 'caches', {
      value: mockCaches,
      writable: true,
      configurable: true,
    });
    
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
        controller: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getRegistrations: vi.fn().mockResolvedValue([{ unregister: mockUnregister }]),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('unregisters existing service workers on mount', async () => {
    mockCaches.keys.mockResolvedValueOnce(['whatsapp-crm-v2']);

    const { useServiceWorker } = await import('@/hooks/system/useServiceWorker');
    renderHook(() => useServiceWorker());

    // Allow async unregister/cleanup to flush
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(navigator.serviceWorker.getRegistrations).toHaveBeenCalled();
    expect(mockUnregister).toHaveBeenCalled();
  });

  it('clears all caches on mount', async () => {
    mockCaches.keys.mockResolvedValueOnce(['whatsapp-crm-v2', 'other-cache']);

    const { useServiceWorker } = await import('@/hooks/system/useServiceWorker');
    renderHook(() => useServiceWorker());

    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    expect(mockCaches.delete).toHaveBeenCalledWith('whatsapp-crm-v2');
    expect(mockCaches.delete).toHaveBeenCalledWith('other-cache');
  });

  it('does not crash when serviceWorker is unavailable', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    
    const { useServiceWorker } = await import('@/hooks/system/useServiceWorker');
    expect(() => renderHook(() => useServiceWorker())).not.toThrow();
  });
});
