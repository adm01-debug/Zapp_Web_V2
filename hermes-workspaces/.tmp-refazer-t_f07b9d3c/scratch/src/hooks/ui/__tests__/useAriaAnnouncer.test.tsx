import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAriaAnnouncer } from '../useAriaAnnouncer';

describe('useAriaAnnouncer', () => {
  beforeEach(() => {
    // rAF é fronteira de relógio: roda na hora para o anúncio ser observável sem espera.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cria a região viva acessível uma única vez no body', () => {
    renderHook(() => useAriaAnnouncer());

    const region = document.getElementById('aria-route-announcer');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('role')).toBe('status');
    expect(region!.getAttribute('aria-live')).toBe('polite');
    expect(region!.getAttribute('aria-atomic')).toBe('true');
    expect(region!.className).toBe('sr-only');
    expect(document.body.querySelectorAll('#aria-route-announcer')).toHaveLength(1);
  });

  it('anuncia a mensagem e re-anuncia limpando o texto antes', () => {
    const { result } = renderHook(() => useAriaAnnouncer());
    const region = document.getElementById('aria-route-announcer')!;

    act(() => result.current.announce('Contatos'));
    expect(region.textContent).toBe('Contatos');

    act(() => result.current.announce('Conversas'));
    expect(region.textContent).toBe('Conversas');
  });

  it('remove a região do body ao desmontar', () => {
    const { unmount } = renderHook(() => useAriaAnnouncer());
    expect(document.getElementById('aria-route-announcer')).not.toBeNull();

    unmount();
    expect(document.getElementById('aria-route-announcer')).toBeNull();
  });
});
