import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useTheme } from '@/hooks/ui/useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.style.colorScheme = '';
  });

  it('initializes with default theme', () => {
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');
    expect(['dark', 'light']).toContain(result.current.resolvedTheme);
  });

  it('toggleTheme changes theme state', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('setTheme updates to specific theme and document class', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('persists theme to localStorage', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('reads persisted theme from localStorage', () => {
    localStorage.setItem('theme', 'dark');
    const { result } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
  });

  it('shares theme state across multiple hook instances', () => {
    const first = renderHook(() => useTheme());
    const second = renderHook(() => useTheme());

    act(() => {
      first.result.current.setTheme('dark');
    });

    expect(second.result.current.theme).toBe('dark');
    expect(second.result.current.isDark).toBe(true);
  });

  it('isDark is false when theme is light', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme('light');
    });

    expect(result.current.isDark).toBe(false);
  });

  // Regressão da suíte completa vermelha: o `setTimeout` de transição do `setTheme`
  // ficava pendente e disparava depois do teardown do jsdom (`ReferenceError: document
  // is not defined`), virando unhandled error e derrubando a suíte com 0 teste falhando.
  // O timer tem de ser cancelado no unmount.
  it('cancela os timers de transição no unmount (não deixa timeout do tema pendente)', () => {
    vi.useFakeTimers();

    try {
      const { result, unmount } = renderHook(() => useTheme());

      act(() => {
        result.current.setTheme('dark');
      });

      const pendentesComTema = vi.getTimerCount();
      expect(pendentesComTema).toBeGreaterThan(0);

      unmount();

      // Dois timers são do tema (350ms do `documentElement`, 300ms do `body` via
      // `applyThemeToDocument`) e têm de morrer no unmount. O jsdom mantém 1 timer
      // próprio de 0ms (`Storage-impl.setItem`), que não é do tema.
      expect(vi.getTimerCount()).toBe(pendentesComTema - 2);
    } finally {
      vi.useRealTimers();
    }
  });

  // HZ3-005 — o doc 26 promete tema sincronizado entre abas, mas nenhuma versão
  // ouvia o `storage` da chave `theme`: trocar o tema numa aba não mudava a outra.
  // O navegador só entrega esse evento às OUTRAS abas, então ele é simulado aqui.
  it('sincroniza o tema gravado em outra aba (evento storage da chave theme)', () => {
    const { result, unmount } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('system');

    act(() => {
      localStorage.setItem('theme', 'dark');
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    unmount();
  });

  it('ignora evento storage de outra chave', () => {
    const { result, unmount } = renderHook(() => useTheme());

    act(() => {
      localStorage.setItem('sidebar-width', '320');
      window.dispatchEvent(new StorageEvent('storage', { key: 'sidebar-width', newValue: '320' }));
    });

    expect(result.current.theme).toBe('system');

    unmount();
  });

  it('chave theme removida em outra aba volta para system', () => {
    localStorage.setItem('theme', 'dark');
    const { result, unmount } = renderHook(() => useTheme());

    expect(result.current.theme).toBe('dark');

    act(() => {
      localStorage.removeItem('theme');
      window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: null }));
    });

    expect(result.current.theme).toBe('system');

    unmount();
  });
});
