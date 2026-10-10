import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxUIState } from './useInboxUIState';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
}

describe('useInboxUIState', () => {
  const originalWidth = window.innerWidth;

  afterEach(() => {
    setViewportWidth(originalWidth);
  });

  it('starts with showDetails=false no celular (evita o painel abrir sozinho e tampar o chat)', () => {
    setViewportWidth(390);
    const { result } = renderHook(() => useInboxUIState());
    expect(result.current.showDetails).toBe(false);
  });

  it('starts with showDetails=true no desktop (comportamento atual preservado)', () => {
    setViewportWidth(1280);
    const { result } = renderHook(() => useInboxUIState());
    expect(result.current.showDetails).toBe(true);
  });

  it('toggleDetails abre o painel no celular quando o agente pede explicitamente', () => {
    setViewportWidth(390);
    const { result } = renderHook(() => useInboxUIState());
    expect(result.current.showDetails).toBe(false);
    act(() => result.current.toggleDetails());
    expect(result.current.showDetails).toBe(true);
  });
});
