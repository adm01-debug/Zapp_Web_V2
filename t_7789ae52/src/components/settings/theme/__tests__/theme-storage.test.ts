import { describe, it, expect, beforeEach } from 'vitest';
import { loadThemeConfig, saveThemeConfig, getDefaultConfig, STORAGE_KEY, STORAGE_VERSION } from '../presets';

describe('storage v6', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sem storage → default (corporate, 14)', () => {
    expect(loadThemeConfig()).toEqual(getDefaultConfig());
  });

  it('v6 round-trip', () => {
    saveThemeConfig({ preset: 'gx-classic', borderRadius: 10 });
    expect(loadThemeConfig()).toEqual({ preset: 'gx-classic', borderRadius: 10 });
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.v).toBe(STORAGE_VERSION);
  });

  it.each([
    ['forest', 'emerald'],
    ['teal', 'cyber'],
    ['purple', 'purpure'],
    ['default', 'corporate'],
  ])('v5 com id legado %s migra para %s', (legacy, expected) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 5, preset: legacy, borderRadius: 8 }));
    const cfg = loadThemeConfig();
    expect(cfg.preset).toBe(expected);
    expect(cfg.borderRadius).toBe(8);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.v).toBe(6);
  });

  it.each([
    [999, 20],
    [-3, 0],
    ['abc', 14],
    [NaN, 14],
  ])('borderRadius %s clampeia para %s', (input, expected) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 6, preset: 'corporate', borderRadius: input }));
    expect(loadThemeConfig().borderRadius).toBe(expected);
  });

  it('id desconhecido cai para corporate mantendo o raio', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 6, preset: 'fantasma', borderRadius: 12 }));
    const cfg = loadThemeConfig();
    expect(cfg.preset).toBe('corporate');
    expect(cfg.borderRadius).toBe(12);
  });

  it('v diferente de 5/6 cai para default completo', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 3, preset: 'gx-razer', borderRadius: 10 }));
    expect(loadThemeConfig()).toEqual(getDefaultConfig());
  });

  it('JSON inválido cai para default', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadThemeConfig()).toEqual(getDefaultConfig());
  });

  it('saveThemeConfig preserva cssVarsCache existente (merge)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 6, preset: 'corporate', borderRadius: 14, cacheMode: 'dark', cachePreset: 'corporate', cssVarsCache: { primary: '221 83% 53%' } }));
    saveThemeConfig({ preset: 'gx-classic', borderRadius: 10 });
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.preset).toBe('gx-classic');
    expect(raw.cssVarsCache).toEqual({ primary: '221 83% 53%' });
    expect(raw.cacheMode).toBe('dark');
  });

  it('saveThemeConfig retorna false quando localStorage lança (quota)', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    };
    try {
      expect(saveThemeConfig({ preset: 'corporate', borderRadius: 14 })).toBe(false);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
