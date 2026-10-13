import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useRealtimeReconnect,
  REALTIME_RECONNECT_THROTTLE_MS,
} from '@/hooks/realtime/useRealtimeReconnect';

function definirVisibilidade(valor: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: valor, configurable: true });
}

describe('useRealtimeReconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    definirVisibilidade('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('revalida quando a rede volta (evento online)', () => {
    const onReconnect = vi.fn();
    renderHook(() => useRealtimeReconnect(onReconnect));

    act(() => { window.dispatchEvent(new Event('online')); });

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('revalida quando a aba volta a ficar visível', () => {
    const onReconnect = vi.fn();
    renderHook(() => useRealtimeReconnect(onReconnect));

    act(() => {
      definirVisibilidade('visible');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('não revalida quando a aba fica oculta', () => {
    const onReconnect = vi.fn();
    renderHook(() => useRealtimeReconnect(onReconnect));

    act(() => {
      definirVisibilidade('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('limita a rajada: os sinais juntos chamam uma vez e agendam a próxima no fim da janela', () => {
    const onReconnect = vi.fn();
    renderHook(() => useRealtimeReconnect(onReconnect));

    act(() => {
      window.dispatchEvent(new Event('online'));
      definirVisibilidade('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(REALTIME_RECONNECT_THROTTLE_MS); });
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it('não registra listeners quando desabilitado', () => {
    const onReconnect = vi.fn();
    renderHook(() => useRealtimeReconnect(onReconnect, false));

    act(() => { window.dispatchEvent(new Event('online')); });

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('desmontar remove os listeners', () => {
    const onReconnect = vi.fn();
    const { unmount } = renderHook(() => useRealtimeReconnect(onReconnect));

    unmount();
    act(() => { window.dispatchEvent(new Event('online')); });

    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('usa sempre o callback do render atual', () => {
    const primeiro = vi.fn();
    const segundo = vi.fn();
    const { rerender } = renderHook(({ cb }) => useRealtimeReconnect(cb), {
      initialProps: { cb: primeiro },
    });

    rerender({ cb: segundo });
    act(() => { window.dispatchEvent(new Event('online')); });

    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledTimes(1);
  });
});
