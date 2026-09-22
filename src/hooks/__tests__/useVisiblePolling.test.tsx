import { StrictMode, type PropsWithChildren } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const visible = (value: boolean) => Object.defineProperty(document, 'visibilityState', { configurable: true, value: value ? 'visible' : 'hidden' });
const online = (value: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, value });

describe('useVisiblePolling', () => {
  beforeEach(() => { vi.useFakeTimers(); visible(true); online(true); });
  afterEach(() => { cleanup(); vi.useRealTimers(); visible(true); online(true); });

  it('reads immediately and schedules again only after completion', async () => {
    const task = vi.fn(async (_signal: AbortSignal) => {});
    renderHook(() => useVisiblePolling(task));
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    await flush(29_999);
    expect(task).toHaveBeenCalledTimes(1);
    await flush(1);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('pauses while hidden and refreshes immediately when visible', async () => {
    const task = vi.fn(async (_signal: AbortSignal) => {});
    renderHook(() => useVisiblePolling(task));
    await flush();
    visible(false);
    await flush(120_000);
    expect(task).toHaveBeenCalledTimes(1);
    visible(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('does not start offline and recovers on the online event', async () => {
    online(false);
    const task = vi.fn(async (_signal: AbortSignal) => {});
    renderHook(() => useVisiblePolling(task));
    await flush(60_000);
    expect(task).not.toHaveBeenCalled();
    online(true);
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('coalesces overlapping manual refreshes into one fresh follow-up', async () => {
    let release!: () => void;
    const task = vi.fn<(signal: AbortSignal) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useVisiblePolling(task));
    await flush();
    const first = result.current();
    const second = result.current();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush(90_000);
    expect(task).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await Promise.all([first, second]); });
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('recovers after a rejection without an unhandled promise', async () => {
    const task = vi.fn<(signal: AbortSignal) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    renderHook(() => useVisiblePolling(task));
    await flush();
    await flush(30_000);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('aborts pending work and removes timers/listeners on unmount', async () => {
    let signal!: AbortSignal;
    let release!: () => void;
    const task = vi.fn((value: AbortSignal) => {
      signal = value;
      return new Promise<void>(resolve => { release = resolve; });
    });
    const { result, unmount } = renderHook(() => useVisiblePolling(task));
    await flush();
    const refresh = result.current;
    unmount();
    expect(signal.aborted).toBe(true);
    release();
    await refresh();
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    await flush(90_000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the first StrictMode setup before starting its read', async () => {
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const task = vi.fn(async (_signal: AbortSignal) => {});
    renderHook(() => useVisiblePolling(task), { wrapper });
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('replaces a changed callback without keeping its old timer', async () => {
    const first = vi.fn(async (_signal: AbortSignal) => {});
    const second = vi.fn(async (_signal: AbortSignal) => {});
    const { rerender } = renderHook(({ task }) => useVisiblePolling(task), { initialProps: { task: first } });
    await flush();
    rerender({ task: second });
    await flush();
    await flush(30_000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('does not read while disabled and aborts when authorization is removed', async () => {
    let signal!: AbortSignal;
    const task = vi.fn((value: AbortSignal) => {
      signal = value;
      return new Promise<void>(() => {});
    });
    const { result, rerender } = renderHook(({ enabled }) => useVisiblePolling(task, 30_000, enabled), { initialProps: { enabled: false } });
    await result.current();
    await flush(60_000);
    expect(task).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await flush();
    expect(task).toHaveBeenCalledTimes(1);
    rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    await result.current();
    await flush(60_000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
