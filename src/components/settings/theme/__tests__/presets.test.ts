import { describe, it, expect, beforeEach } from 'vitest';
import {
  THEME_PRESETS,
  CSS_VARS_TO_APPLY,
  getPresetById,
  classicPresets,
  gxPresets,
  normalizePresetId,
  getDefaultConfig,
  applyThemePreset,
  applyRadius,
  clearThemeOverrides,
  exportThemeConfig,
  importThemeConfig,
  loadThemeConfig,
  saveThemeConfig,
  STORAGE_KEY,
} from '../presets';

// ─── HSL → sRGB → luminância relativa → contraste WCAG (sem lib nova) ──────
function parseHsl(s: string): [number, number, number] {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/)!;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
function contrastRatio(hslA: string, hslB: string): number {
  const la = relativeLuminance(hslToRgb(...parseHsl(hslA)));
  const lb = relativeLuminance(hslToRgb(...parseHsl(hslB)));
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

beforeEach(() => {
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.presetId;
});

const CLASSIC_IDS = [
  'corporate', 'purpure', 'emerald', 'sunset', 'rose', 'minimal', 'ocean', 'amber', 'cyber', 'diversity',
];
const GX_IDS = [
  'gx-classic', 'gx-pink-addiction', 'gx-purple-haze', 'gx-rose-quartz', 'gx-ultraviolet',
  'gx-hackerman', 'gx-frutti-di-mare', 'gx-cyberpunk', 'gx-razer',
];
const DARK_FG_GX = ['gx-rose-quartz', 'gx-hackerman', 'gx-frutti-di-mare', 'gx-cyberpunk', 'gx-razer'];

describe('§1 catálogo', () => {
  it('tem 19 presets com ids únicos', () => {
    expect(THEME_PRESETS).toHaveLength(19);
    expect(new Set(THEME_PRESETS.map((p) => p.id)).size).toBe(19);
  });

  it('corporate é o primeiro', () => {
    expect(THEME_PRESETS[0].id).toBe('corporate');
  });

  it('ordem é clássicas (10) seguidas de GX (9)', () => {
    expect(THEME_PRESETS.slice(0, 10).map((p) => p.id)).toEqual(CLASSIC_IDS);
    expect(THEME_PRESETS.slice(10).map((p) => p.id)).toEqual(GX_IDS);
  });

  it.each(THEME_PRESETS.map((p) => [p.id, p] as const))('%s tem name/description/emoji/swatches[4]/light/dark', (_id, p) => {
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.description.length).toBeGreaterThan(0);
    expect(p.emoji.length).toBeGreaterThan(0);
    expect(p.swatches).toHaveLength(4);
    expect(new Set(p.swatches).size).toBe(4);
    expect(p.light).toBeTruthy();
    expect(p.dark).toBeTruthy();
  });

  it('CSS_VARS_TO_APPLY não tem duplicatas e bate com as chaves de ThemeModeColors', () => {
    expect(new Set(CSS_VARS_TO_APPLY).size).toBe(CSS_VARS_TO_APPLY.length);
    const keysFromCorporate = Object.keys(getPresetById('corporate')!.light);
    expect([...CSS_VARS_TO_APPLY].sort()).toEqual([...keysFromCorporate].sort());
  });

  it('grupo C (tokens fixos) não aparece em CSS_VARS_TO_APPLY', () => {
    for (const fixed of ['success', 'warning', 'whatsapp', 'kpi-tile-green', 'destructive', 'chart-2']) {
      expect(CSS_VARS_TO_APPLY as readonly string[]).not.toContain(fixed);
    }
  });

  it('getPresetById / classicPresets / gxPresets', () => {
    expect(getPresetById('gx-classic')?.id).toBe('gx-classic');
    expect(getPresetById('inexistente')).toBeUndefined();
    expect(classicPresets).toHaveLength(10);
    expect(gxPresets).toHaveLength(9);
  });
});

describe('§2 clássicas', () => {
  it.each(CLASSIC_IDS.map((id) => [id] as const))('%s é category classic, sem borderRadius/font', (id) => {
    const p = getPresetById(id)!;
    expect(p.category).toBe('classic');
    expect(p.borderRadius).toBeUndefined();
    expect(p.font).toBeUndefined();
  });

  it('corporate reproduz tokens.css: primary, background, secondary', () => {
    const p = getPresetById('corporate')!;
    expect(p.dark.primary).toBe('221 83% 53%');
    expect(p.light.background).toBe('221 20% 97%');
    expect(p.light.secondary).toBe('215 70% 55%');
  });

  it('causa raiz #1 morta: dark.primary usa o hue do preset, nunca literal', () => {
    const rose = getPresetById('rose')!;
    expect(rose.dark.primary).toBe('346 77% 50%');
    expect(rose.dark.primary).not.toBe('221 83% 53%');
  });
});

describe('§4 pipeline GX', () => {
  it.each(GX_IDS.map((id) => [id] as const))('%s é category gx com borderRadius 10 e superfícies roxas', (id) => {
    const p = getPresetById(id)!;
    expect(p.category).toBe('gx');
    expect(p.borderRadius).toBe(10);
    expect(p.dark.background).toBe('265 22% 8%');
    expect(p.dark.card).toBe('265 22% 12%');
  });

  it('gx-classic: alphas de glow neon (0.7 dark / 0.45 light)', () => {
    const p = getPresetById('gx-classic')!;
    expect(p.dark['shadow-glow-primary']).toMatch(/\/\s*0\.7\s*\)/);
    expect(p.light['shadow-glow-primary']).toMatch(/\/\s*0\.45\s*\)/);
  });

  it('gx-classic: glass translúcido', () => {
    const p = getPresetById('gx-classic')!;
    expect(p.dark['glass-bg']).toBe('265 22% 12% / 0.55');
    expect(p.light['glass-bg']).toBe('0 0% 100% / 0.55');
  });

  it('GX light não é roxo (primary continua com o hue do preset)', () => {
    const p = getPresetById('gx-classic')!;
    expect(p.light.primary).toBe('347 96% 54%');
  });

  it.each(DARK_FG_GX.map((id) => [id] as const))('%s usa withDarkPrimaryFg (texto escuro)', (id) => {
    const p = getPresetById(id)!;
    expect(p.light['primary-foreground']).toBe('222 25% 10%');
    expect(p.dark['primary-foreground']).toBe('222 25% 10%');
    expect(p.dark['sidebar-primary-foreground']).toBe('222 25% 10%');
  });

  it('gx-purple-haze e gx-ultraviolet NÃO usam withDarkPrimaryFg (texto branco)', () => {
    expect(getPresetById('gx-purple-haze')!.dark['primary-foreground']).toBe('0 0% 100%');
    expect(getPresetById('gx-ultraviolet')!.dark['primary-foreground']).toBe('0 0% 100%');
  });
});

describe('§3 paridade GX (Apêndice A — HSL idênticos ao Zapp)', () => {
  const EXPECTED: Record<string, string> = {
    'gx-classic': '347 96% 54%',
    'gx-pink-addiction': '330 95% 60%',
    'gx-purple-haze': '265 65% 50%',
    'gx-rose-quartz': '345 75% 68%',
    'gx-ultraviolet': '271 76% 53%',
    'gx-hackerman': '127 65% 46%',
    'gx-frutti-di-mare': '182 90% 42%',
    'gx-cyberpunk': '55 100% 51%',
    'gx-razer': '113 70% 51%',
  };

  it.each(Object.entries(EXPECTED))('%s tem primary %s, category gx, borderRadius 10, sem font, light===dark.primary', (id, hsl) => {
    const p = getPresetById(id)!;
    expect(p.dark.primary).toBe(hsl);
    expect(p.light.primary).toBe(hsl);
    expect(p.category).toBe('gx');
    expect(p.borderRadius).toBe(10);
    expect(p.font).toBeUndefined();
  });
});

describe('§6 applyRadius', () => {
  it('aplica clamp 0-20 e converte para rem (16px = 1rem)', () => {
    applyRadius(10);
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.625rem');
    applyRadius(999);
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('1.25rem');
    applyRadius(-5);
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0rem');
    applyRadius(NaN);
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.875rem');
  });
});

describe('§7 clearThemeOverrides', () => {
  it('remove todas as CSS_VARS_TO_APPLY, --radius, --font-* e data-preset-id', () => {
    applyThemePreset('gx-classic', 'dark');
    expect(document.documentElement.dataset.presetId).toBe('gx-classic');
    clearThemeOverrides();
    for (const key of CSS_VARS_TO_APPLY) {
      expect(document.documentElement.style.getPropertyValue(`--${key}`)).toBe('');
    }
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('');
    expect(document.documentElement.dataset.presetId).toBeUndefined();
  });

  it('limpa os campos de cache do storage', () => {
    saveThemeConfig({ preset: 'gx-classic', borderRadius: 10 });
    applyThemePreset('gx-classic', 'dark');
    clearThemeOverrides();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.cssVarsCache).toBeUndefined();
    expect(raw.cacheMode).toBeUndefined();
    expect(raw.cachePreset).toBeUndefined();
  });
});

describe('§9 export/import', () => {
  it('round-trip exportThemeConfig → importThemeConfig', () => {
    const cfg = { preset: 'gx-razer', borderRadius: 10 };
    const json = exportThemeConfig(cfg);
    expect(importThemeConfig(json)).toEqual(cfg);
  });

  it('importThemeConfig rejeita preset inexistente, radius não-numérico ou JSON inválido', () => {
    expect(importThemeConfig(JSON.stringify({ preset: 'fantasma', borderRadius: 10 }))).toBeNull();
    expect(importThemeConfig(JSON.stringify({ preset: 'corporate', borderRadius: 'oito' }))).toBeNull();
    expect(importThemeConfig('{not json')).toBeNull();
  });

  it('importThemeConfig clampeia o radius importado', () => {
    expect(importThemeConfig(JSON.stringify({ preset: 'corporate', borderRadius: 999 }))).toEqual({ preset: 'corporate', borderRadius: 20 });
  });
});

describe('§5 applyThemePreset', () => {
  it('id desconhecido é no-op', () => {
    applyThemePreset('gx-classic', 'dark');
    const before = document.documentElement.style.getPropertyValue('--primary');
    applyThemePreset('fantasma', 'dark');
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(before);
  });

  it('aplica todos os tokens de CSS_VARS_TO_APPLY e --radius só quando o preset define', () => {
    applyThemePreset('gx-classic', 'dark');
    for (const key of CSS_VARS_TO_APPLY) {
      expect(document.documentElement.style.getPropertyValue(`--${key}`)).not.toBe('');
    }
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.625rem');

    // applyThemePreset não mexe em --radius quando o preset não define
    // borderRadius (fica com o valor anterior) — quem reseta é applyRadius,
    // sempre chamado em seguida por useThemePreset/ThemeInitializer (snap).
    applyThemePreset('corporate', 'dark');
    applyRadius(getDefaultConfig().borderRadius);
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.875rem');
  });

  it('light !== dark para uma skin clássica', () => {
    applyThemePreset('rose', 'light');
    const light = document.documentElement.style.getPropertyValue('--background');
    applyThemePreset('rose', 'dark');
    const dark = document.documentElement.style.getPropertyValue('--background');
    expect(light).not.toBe(dark);
  });

  it('estampa data-preset-id e a classe theme-transitioning', () => {
    applyThemePreset('emerald', 'dark');
    expect(document.documentElement.dataset.presetId).toBe('emerald');
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true);
  });

  it('persistCache:false não grava cssVarsCache/cacheMode/cachePreset', () => {
    localStorage.clear();
    applyThemePreset('corporate', 'dark', { persistCache: false });
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      expect(parsed.cssVarsCache).toBeUndefined();
    } else {
      expect(raw).toBeNull();
    }
  });

  it('persistCache padrão (true) grava o cache', () => {
    localStorage.clear();
    applyThemePreset('gx-razer', 'dark');
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(raw.cachePreset).toBe('gx-razer');
    expect(raw.cacheMode).toBe('dark');
    expect(raw.cssVarsCache.primary).toBe('113 70% 51%');
  });
});

describe('§11 fluxos', () => {
  beforeEach(() => localStorage.clear());

  it('primeira vez numa GX: aplica cores + radius 10', () => {
    applyThemePreset('gx-purple-haze', 'dark');
    applyRadius(getPresetById('gx-purple-haze')!.borderRadius!);
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.625rem');
  });

  it('GX → clássica: snap do raio para o default (14) via applyRadius', () => {
    applyThemePreset('gx-purple-haze', 'dark');
    applyRadius(getPresetById('gx-purple-haze')!.borderRadius!);
    applyThemePreset('corporate', 'dark');
    applyRadius(getDefaultConfig().borderRadius);
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.875rem');
  });

  it('reload simulado: loadThemeConfig + applyThemePreset reconstrói o estado salvo', () => {
    saveThemeConfig({ preset: 'gx-cyberpunk', borderRadius: 10 });
    const cfg = loadThemeConfig();
    applyThemePreset(cfg.preset, 'dark');
    expect(document.documentElement.dataset.presetId).toBe('gx-cyberpunk');
  });

  it('alternar entre as 9 GX aplica 9 primárias distintas', () => {
    const seen = new Set<string>();
    for (const p of gxPresets) {
      applyThemePreset(p.id, 'dark');
      seen.add(document.documentElement.style.getPropertyValue('--primary'));
    }
    expect(seen.size).toBe(9);
  });

  it('reset volta para corporate com radius 14', () => {
    applyThemePreset('gx-classic', 'dark');
    clearThemeOverrides();
    const def = getDefaultConfig();
    applyThemePreset(def.preset, 'dark');
    applyRadius(def.borderRadius);
    expect(document.documentElement.dataset.presetId).toBe('corporate');
    expect(document.documentElement.style.getPropertyValue('--radius')).toBe('0.875rem');
  });
});

describe('§11.5 Diversity', () => {
  const diversity = getPresetById('diversity')!;

  it('gradient-primary contém as 6 cores do arco-íris', () => {
    const colors = ['0 85% 55%', '30 90% 55%', '55 90% 50%', '130 70% 45%', '210 80% 55%', '280 80% 58%'];
    for (const c of colors) {
      expect(diversity.light['gradient-primary']).toContain(c);
    }
  });

  it('dark.accent começa com 280 (violeta)', () => {
    expect(diversity.dark.accent.startsWith('280 ')).toBe(true);
  });

  it('swatches são [vermelho, amarelo, verde, roxo]', () => {
    expect(diversity.swatches).toEqual(['hsl(0 85% 55%)', 'hsl(55 90% 50%)', 'hsl(130 70% 45%)', 'hsl(280 80% 58%)']);
  });

  it('gradient-success sobrescrito (verde→azul pride), diferente do grupo C padrão', () => {
    expect(diversity.light['gradient-success']).toContain('130 70% 45%');
    expect(diversity.light['gradient-success']).toContain('210 80% 55%');
  });
});

describe('§68 contraste WCAG (primary vs primary-foreground, sidebar-primary vs sidebar-primary-foreground)', () => {
  it.each(THEME_PRESETS.map((p) => [p.id, p] as const))('%s: contraste ≥ 3:1 em light e dark', (_id, p) => {
    for (const mode of ['light', 'dark'] as const) {
      const colors = p[mode];
      expect(contrastRatio(colors.primary, colors['primary-foreground'])).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(colors['sidebar-primary'], colors['sidebar-primary-foreground'])).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('§12 edge cases', () => {
  it('normalizePresetId migra ids legados', () => {
    expect(normalizePresetId('default')).toBe('corporate');
    expect(normalizePresetId('forest')).toBe('emerald');
    expect(normalizePresetId('teal')).toBe('cyber');
    expect(normalizePresetId('purple')).toBe('purpure');
  });

  it('normalizePresetId cai para corporate em id desconhecido/tipo inválido', () => {
    expect(normalizePresetId('fantasma')).toBe('corporate');
    expect(normalizePresetId(undefined)).toBe('corporate');
    expect(normalizePresetId(123)).toBe('corporate');
  });

  it('getDefaultConfig', () => {
    expect(getDefaultConfig()).toEqual({ preset: 'corporate', borderRadius: 14 });
  });
});
