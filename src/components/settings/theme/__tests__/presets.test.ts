import { describe, it, expect } from 'vitest';
import {
  THEME_PRESETS,
  CSS_VARS_TO_APPLY,
  getPresetById,
  classicPresets,
  gxPresets,
  normalizePresetId,
  getDefaultConfig,
} from '../presets';

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
