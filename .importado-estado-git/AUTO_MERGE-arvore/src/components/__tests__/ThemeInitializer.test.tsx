import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ThemeInitializer } from '../ThemeInitializer';
import { STORAGE_KEY } from '../settings/theme/presets';

let mockResolvedTheme: 'light' | 'dark' = 'dark';
vi.mock('@/hooks/ui/useTheme', () => ({
  useTheme: () => ({ resolvedTheme: mockResolvedTheme }),
}));

function getVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

describe('ThemeInitializer', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.presetId;
    mockResolvedTheme = 'dark';
  });

  it('mount sem storage aplica corporate dark e grava v6', () => {
    render(<ThemeInitializer />);
    expect(getVar('primary')).toBe('221 83% 53%');
    expect(document.documentElement.dataset.presetId).toBe('corporate');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.v).toBe(6);
    expect(stored.cachePreset).toBe('corporate');
    expect(stored.cacheMode).toBe('dark');
  });

  it('storage v5 com id legado migra e aplica o preset novo', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 5, preset: 'forest', borderRadius: 8 }));
    render(<ThemeInitializer />);
    expect(document.documentElement.dataset.presetId).toBe('emerald');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.v).toBe(6);
    expect(stored.preset).toBe('emerald');
    expect(stored.borderRadius).toBe(8);
  });

  it('evento storage de outra aba aplica preset sem regravar cache (persistCache:false)', () => {
    render(<ThemeInitializer />);
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify({ v: 6, preset: 'gx-razer', borderRadius: 10 }),
        }),
      );
    });
    expect(getVar('primary')).toBe('113 70% 51%');
    expect(document.documentElement.dataset.presetId).toBe('gx-razer');
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('etapa 38: trocar de dark para light reaplica o preset light e atualiza cacheMode', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 6, preset: 'gx-classic', borderRadius: 10 }));
    const { rerender } = render(<ThemeInitializer />);
    expect(getVar('background')).toBe('265 22% 8%');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).cacheMode).toBe('dark');

    mockResolvedTheme = 'light';
    rerender(<ThemeInitializer />);
    expect(getVar('background')).toBe('347 20% 97%');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).cacheMode).toBe('light');
  });
});
