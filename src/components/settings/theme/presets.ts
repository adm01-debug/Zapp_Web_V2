/**
 * Comprehensive theme presets with FULL CSS variable coverage.
 * Each preset defines colors for BOTH light and dark modes,
 * ensuring the entire UI transforms when a skin is selected.
 */

export interface ThemeModeColors {
  // Core surfaces
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  'card-elevated': string;
  popover: string;
  'popover-foreground': string;

  // Primary
  primary: string;
  'primary-foreground': string;
  'primary-glow': string;

  // Secondary
  secondary: string;
  'secondary-foreground': string;

  // Muted
  muted: string;
  'muted-foreground': string;

  // Accent
  accent: string;
  'accent-foreground': string;

  // Borders & inputs
  border: string;
  input: string;
  ring: string;

  // Gamification
  xp: string;
  unread: string;

  // Sidebar
  'sidebar-background': string;
  'sidebar-foreground': string;
  'sidebar-primary': string;
  'sidebar-primary-foreground': string;
  'sidebar-accent': string;
  'sidebar-accent-foreground': string;
  'sidebar-border': string;
  'sidebar-ring': string;

  // Chat
  'chat-bubble-sent': string;
  'chat-bubble-sent-foreground': string;
  'chat-bubble-received': string;
  'chat-bubble-received-foreground': string;
  'chat-header': string;
  'chat-input-bg': string;

  // Status
  'status-open': string;

  // Gradients
  'gradient-primary': string;
  'gradient-secondary': string;
  'gradient-xp': string;
  'gradient-vibrant': string;
  'gradient-purple-green': string;
  'gradient-surface': string;
  'gradient-divider': string;

  // Shadows
  'shadow-glow-primary': string;
  'shadow-glow-secondary': string;
  'shadow-glow-accent': string;
  'shadow-glow-purple': string;

  // Glass
  'glass-bg': string;
  'glass-border': string;

  // Elevated
  elevated: string;
  'elevated-hover': string;

  // Charts
  'chart-1': string;
  'chart-9': string;
  'chart-status-open': string;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  swatches: [string, string, string, string];
  light: ThemeModeColors;
  dark: ThemeModeColors;
}

/**
 * All CSS variable keys that presets will apply/remove.
 */
export const CSS_VARS_TO_APPLY: (keyof ThemeModeColors)[] = [
  'background', 'foreground',
  'card', 'card-foreground', 'card-elevated',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'primary-glow',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'border', 'input', 'ring',
  'xp', 'unread',
  'sidebar-background', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
  'chat-bubble-sent', 'chat-bubble-sent-foreground',
  'chat-bubble-received', 'chat-bubble-received-foreground',
  'chat-header', 'chat-input-bg',
  'status-open',
  'gradient-primary', 'gradient-secondary', 'gradient-xp',
  'gradient-vibrant', 'gradient-purple-green',
  'gradient-surface', 'gradient-divider',
  'shadow-glow-primary', 'shadow-glow-secondary',
  'shadow-glow-accent', 'shadow-glow-purple',
  'glass-bg', 'glass-border',
  'elevated', 'elevated-hover',
  'chart-1', 'chart-9', 'chart-status-open',
];

// ──────────── Helper ────────────
interface PresetParams {
  id: string;
  name: string;
  description: string;
  emoji: string;
  // Primary hue/sat/light
  h: number; s: number; l: number;
  // Glow hue
  gh: number;
  // Secondary hue/sat/light
  sh: number; ss: number; sl: number;
}

const buildPreset = (p: PresetParams): ThemePreset => {
  const { id, name, description, emoji, h, s, l, gh, sh, ss, sl } = p;

  const light: ThemeModeColors = {
    background: `${h} 20% 97%`,
    foreground: `${h} 20% 12%`,
    card: `0 0% 100%`,
    'card-foreground': `${h} 20% 12%`,
    'card-elevated': `0 0% 100%`,
    popover: `0 0% 100%`,
    'popover-foreground': `${h} 20% 12%`,
    primary: `${h} ${s}% ${l}%`,
    'primary-foreground': '0 0% 100%',
    'primary-glow': `${gh} ${s + 3}% ${l + 6}%`,
    secondary: `${sh} ${ss}% ${sl}%`,
    'secondary-foreground': '0 0% 100%',
    muted: `${h} 15% 92%`,
    'muted-foreground': `${h} 10% 45%`,
    accent: `${h} 55% 95%`,
    'accent-foreground': `${h} ${s}% ${l - 8}%`,
    border: `${h} 15% 90%`,
    input: `${h} 15% 93%`,
    ring: `${h} ${s}% ${l}%`,
    xp: `${h} ${s}% ${l}%`,
    unread: `${h} ${s}% ${l}%`,
    'sidebar-background': `0 0% 100%`,
    'sidebar-foreground': `${h} 20% 12%`,
    'sidebar-primary': `${h} ${s}% ${l}%`,
    'sidebar-primary-foreground': '0 0% 100%',
    'sidebar-accent': `${h} 50% 96%`,
    'sidebar-accent-foreground': `${h} ${s}% ${l - 8}%`,
    'sidebar-border': `${h} 15% 92%`,
    'sidebar-ring': `${h} ${s}% ${l}%`,
    'chat-bubble-sent': `${h} ${s}% ${l}%`,
    'chat-bubble-sent-foreground': '0 0% 100%',
    'chat-bubble-received': `${h} 15% 95%`,
    'chat-bubble-received-foreground': `${h} 20% 15%`,
    'chat-header': `0 0% 100%`,
    'chat-input-bg': `0 0% 100%`,
    'status-open': `${h} ${s}% ${l}%`,
    'gradient-primary': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(${gh} ${s - 7}% ${l + 4}%))`,
    'gradient-secondary': `linear-gradient(135deg, hsl(${sh} ${ss}% ${sl}%), hsl(${gh} ${ss - 10}% ${sl + 5}%))`,
    'gradient-xp': `linear-gradient(90deg, hsl(${h} ${s}% ${l}%), hsl(${gh} ${s - 7}% ${l + 4}%))`,
    'gradient-vibrant': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(210 80% 55%), hsl(${gh} ${s - 7}% ${l + 4}%))`,
    'gradient-purple-green': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(155 75% 48%))`,
    'gradient-surface': `linear-gradient(180deg, hsl(${h} 20% 97%), hsl(${h} 15% 95%))`,
    'gradient-divider': `linear-gradient(90deg, transparent, hsl(${h} 15% 88% / 0.5), transparent)`,
    'shadow-glow-primary': `0 4px 24px hsl(${h} ${s}% ${l}% / 0.25)`,
    'shadow-glow-secondary': `0 4px 24px hsl(${sh} ${ss}% ${sl}% / 0.2)`,
    'shadow-glow-accent': `0 4px 24px hsl(${gh} ${s - 7}% ${l + 4}% / 0.25)`,
    'shadow-glow-purple': `0 4px 24px hsl(${h} ${s}% ${l}% / 0.3)`,
    'glass-bg': `0 0% 100% / 1`,
    'glass-border': `${h} 20% 88% / 1`,
    elevated: `0 0% 100%`,
    'elevated-hover': `${h} 20% 97%`,
    'chart-1': `${h} ${s}% ${l}%`,
    'chart-9': `${gh} ${s - 7}% ${sl}%`,
    'chart-status-open': `${h} ${s}% ${l}%`,
  };

  const dark: ThemeModeColors = {
    background: `216 54% 5%`,
    foreground: `0 0% 97%`,
    card: `215 50% 10%`,
    'card-foreground': `0 0% 97%`,
    'card-elevated': `215 52% 13%`,
    popover: `214 52% 9%`,
    'popover-foreground': `0 0% 97%`,
    primary: `${h} ${s}% ${l}%`,
    'primary-foreground': '0 0% 100%',
    'primary-glow': `${gh} ${s + 3}% ${l + 6}%`,
    secondary: `${sh} ${ss}% ${sl}%`,
    'secondary-foreground': '0 0% 100%',
    muted: `214 49% 14%`,
    'muted-foreground': `215 16% 59%`,
    accent: `${h} 60% 22%`,
    'accent-foreground': `${h} ${s}% 80%`,
    border: `213 26% 25%`,
    input: `214 42% 13%`,
    ring: `${h} ${s}% ${l}%`,
    xp: `${h} ${s}% ${l}%`,
    unread: `${h} ${s}% ${l}%`,
    'sidebar-background': `215 52% 8%`,
    'sidebar-foreground': `0 0% 97%`,
    'sidebar-primary': `${h} ${s}% ${l}%`,
    'sidebar-primary-foreground': '0 0% 100%',
    'sidebar-accent': `${h} 50% 20%`,
    'sidebar-accent-foreground': `${h} ${s}% 80%`,
    'sidebar-border': `213 26% 25%`,
    'sidebar-ring': `${h} ${s}% ${l}%`,
    'chat-bubble-sent': `${h} ${s}% ${l}%`,
    'chat-bubble-sent-foreground': '0 0% 100%',
    'chat-bubble-received': `214 49% 14%`,
    'chat-bubble-received-foreground': `0 0% 97%`,
    'chat-header': `215 50% 10%`,
    'chat-input-bg': `214 52% 9%`,
    'status-open': `${h} ${s}% ${l}%`,
    'gradient-primary': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-secondary': `linear-gradient(135deg, hsl(${sh} ${ss}% ${sl}%), hsl(${gh} ${ss - 8}% ${sl + 5}%))`,
    'gradient-xp': `linear-gradient(90deg, hsl(${h} ${s}% ${l}%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-vibrant': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(210 95% 62%), hsl(${gh} ${s - 5}% ${l + 4}%))`,
    'gradient-purple-green': `linear-gradient(135deg, hsl(${h} ${s}% ${l}%), hsl(155 80% 50%))`,
    'gradient-surface': `linear-gradient(180deg, hsl(215 50% 10%), hsl(216 54% 5%))`,
    'gradient-divider': `linear-gradient(90deg, transparent, hsl(${h} 50% 35% / 0.5), transparent)`,
    'shadow-glow-primary': `0 4px 24px hsl(${h} ${s}% ${l}% / 0.45)`,
    'shadow-glow-secondary': `0 4px 24px hsl(${sh} ${ss}% ${sl}% / 0.4)`,
    'shadow-glow-accent': `0 4px 24px hsl(${gh} ${s - 7}% ${l + 4}% / 0.4)`,
    'shadow-glow-purple': `0 4px 24px hsl(${h} ${s}% ${l}% / 0.5)`,
    'glass-bg': `215 50% 10% / 1`,
    'glass-border': `${h} 50% 30% / 1`,
    elevated: `215 52% 13%`,
    'elevated-hover': `215 55% 15%`,
    'chart-1': `${h} ${s}% ${l}%`,
    'chart-9': `${gh} ${s - 7}% ${sl}%`,
    'chart-status-open': `${h} ${s}% ${l}%`,
  };

  return {
    id,
    name,
    description,
    emoji,
    swatches: [
      `hsl(${h} ${s}% ${l}%)`,
      `hsl(${sh} ${ss}% ${sl}%)`,
      `hsl(${gh} ${s - 5}% ${l + 6}%)`,
      `hsl(${h} ${Math.round(s * 0.5)}% ${l + 15}%)`,
    ],
    light,
    dark,
  };
};

// ──────────── PRESETS ────────────
export const PRESETS: ThemePreset[] = [
  (() => {
    const corporate = buildPreset({ id: 'corporate', name: 'Padrão', description: 'Azul profissional', emoji: '💼', h: 221, s: 83, l: 53, gh: 230, sh: 215, ss: 70, sl: 55 });
    // Dark mode segue a paleta DarkBlue Premium (design system v1.0) — light mode inalterado.
    corporate.dark.primary = '213 100% 54%';
    corporate.dark['primary-glow'] = '213 100% 68%';
    corporate.dark.secondary = '213 94% 62%';
    corporate.dark.ring = '213 100% 54%';
    corporate.dark['sidebar-primary'] = '213 100% 54%';
    corporate.dark['sidebar-ring'] = '213 100% 54%';
    corporate.dark['chat-bubble-sent'] = '213 100% 54%';
    corporate.dark['status-open'] = '213 100% 54%';
    corporate.dark['chart-1'] = '213 100% 54%';
    corporate.dark.accent = '214 49% 14%';
    corporate.dark['accent-foreground'] = '213 100% 85%';
    corporate.dark['sidebar-accent'] = '214 49% 16%';
    corporate.dark['sidebar-accent-foreground'] = '213 100% 85%';
    return corporate;
  })(),
  buildPreset({ id: 'purpure', name: 'Púrpure', description: 'Roxo vibrante original', emoji: '💜', h: 254, s: 92, l: 62, gh: 260, sh: 260, ss: 90, sl: 67 }),
  buildPreset({ id: 'emerald', name: 'Esmeralda', description: 'Verde sofisticado', emoji: '💎', h: 160, s: 84, l: 45, gh: 170, sh: 145, ss: 70, sl: 50 }),
  buildPreset({ id: 'sunset', name: 'Pôr do Sol', description: 'Quente e acolhedor', emoji: '🌅', h: 25, s: 95, l: 53, gh: 35, sh: 15, ss: 80, sl: 50 }),
  buildPreset({ id: 'rose', name: 'Rosé', description: 'Elegante e moderno', emoji: '🌸', h: 346, s: 77, l: 50, gh: 355, sh: 330, ss: 70, sl: 55 }),
  buildPreset({ id: 'minimal', name: 'Minimal', description: 'Clean e neutro', emoji: '⚪', h: 220, s: 15, l: 50, gh: 220, sh: 220, ss: 10, sl: 45 }),
  buildPreset({ id: 'ocean', name: 'Oceano', description: 'Azul profundo', emoji: '🌊', h: 200, s: 85, l: 55, gh: 210, sh: 190, ss: 75, sl: 50 }),
  buildPreset({ id: 'amber', name: 'Âmbar', description: 'Dourado e premium', emoji: '✨', h: 38, s: 92, l: 50, gh: 45, sh: 30, ss: 80, sl: 55 }),
  buildPreset({ id: 'cyber', name: 'Cyber', description: 'Neon futurista', emoji: '🤖', h: 180, s: 100, l: 50, gh: 300, sh: 320, ss: 100, sl: 60 }),
  (() => {
    // Diversity — Rainbow Pride theme 🏳️‍🌈
    // Use a vibrant magenta/pink as primary for max color pop
    const base = buildPreset({ id: 'diversity', name: 'Diversity', description: 'Orgulho e diversidade 🏳️‍🌈', emoji: '🏳️‍🌈', h: 330, s: 90, l: 58, gh: 280, sh: 160, ss: 85, sl: 50 });
    
    const rainbowGrad = 'linear-gradient(135deg, hsl(0 85% 55%), hsl(30 90% 55%), hsl(55 90% 50%), hsl(130 70% 45%), hsl(210 80% 55%), hsl(280 80% 58%))';
    const rainbowGradH = 'linear-gradient(90deg, hsl(0 85% 55%), hsl(30 90% 55%), hsl(55 90% 50%), hsl(130 70% 45%), hsl(210 80% 55%), hsl(280 80% 58%))';
    const rainbowGradSurface = 'linear-gradient(180deg, hsl(280 30% 8%), hsl(330 20% 6%))';
    const rainbowGradSurfaceLight = 'linear-gradient(180deg, hsl(330 30% 97%), hsl(280 20% 95%))';
    const rainbowDivider = 'linear-gradient(90deg, hsl(0 85% 55% / 0.4), hsl(55 90% 50% / 0.4), hsl(130 70% 45% / 0.4), hsl(210 80% 55% / 0.4), hsl(280 80% 58% / 0.4))';

    // Override ALL gradients with rainbow
    base.light['gradient-primary'] = rainbowGrad;
    base.light['gradient-secondary'] = rainbowGrad;
    base.light['gradient-xp'] = rainbowGradH;
    base.light['gradient-vibrant'] = rainbowGrad;
    base.light['gradient-purple-green'] = rainbowGrad;
    base.light['gradient-surface'] = rainbowGradSurfaceLight;
    base.light['gradient-divider'] = rainbowDivider;
    
    base.dark['gradient-primary'] = rainbowGrad;
    base.dark['gradient-secondary'] = rainbowGrad;
    base.dark['gradient-xp'] = rainbowGradH;
    base.dark['gradient-vibrant'] = rainbowGrad;
    base.dark['gradient-purple-green'] = rainbowGrad;
    base.dark['gradient-surface'] = rainbowGradSurface;
    base.dark['gradient-divider'] = rainbowDivider;

    // Make shadows colorful
    base.light['shadow-glow-primary'] = '0 4px 24px hsl(330 90% 58% / 0.3)';
    base.light['shadow-glow-secondary'] = '0 4px 24px hsl(160 85% 50% / 0.25)';
    base.light['shadow-glow-accent'] = '0 4px 24px hsl(280 80% 58% / 0.25)';
    base.light['shadow-glow-purple'] = '0 4px 24px hsl(280 80% 58% / 0.3)';
    base.dark['shadow-glow-primary'] = '0 4px 24px hsl(330 90% 58% / 0.4)';
    base.dark['shadow-glow-secondary'] = '0 4px 24px hsl(160 85% 50% / 0.35)';
    base.dark['shadow-glow-accent'] = '0 4px 24px hsl(280 80% 58% / 0.35)';
    base.dark['shadow-glow-purple'] = '0 4px 24px hsl(280 80% 58% / 0.4)';

    // Colorful accents — make secondary green/teal, accent purple
    base.dark['secondary'] = '160 85% 50%';
    base.dark['accent'] = '280 60% 25%';
    base.dark['accent-foreground'] = '280 80% 78%';
    base.dark['ring'] = '330 90% 58%';
    base.dark['xp'] = '130 70% 45%';
    base.dark['unread'] = '0 85% 55%';
    base.dark['status-open'] = '130 70% 50%';
    base.dark['sidebar-primary'] = '330 90% 58%';
    base.dark['sidebar-accent'] = '280 50% 20%';
    base.dark['sidebar-accent-foreground'] = '280 80% 78%';
    base.dark['sidebar-ring'] = '330 90% 58%';
    base.dark['chat-bubble-sent'] = '330 90% 55%';
    base.dark['glass-border'] = '330 50% 35% / 0.4';
    base.dark['chart-1'] = '330 90% 58%';
    base.dark['chart-9'] = '160 85% 50%';
    base.dark['chart-status-open'] = '130 70% 50%';

    base.light['secondary'] = '160 85% 45%';
    base.light['accent'] = '280 55% 93%';
    base.light['accent-foreground'] = '280 80% 45%';
    base.light['ring'] = '330 90% 55%';
    base.light['xp'] = '130 70% 40%';
    base.light['unread'] = '0 85% 50%';
    base.light['status-open'] = '130 70% 45%';
    base.light['sidebar-primary'] = '330 90% 55%';
    base.light['sidebar-accent'] = '330 50% 95%';
    base.light['sidebar-accent-foreground'] = '330 90% 45%';
    base.light['sidebar-ring'] = '330 90% 55%';
    base.light['chat-bubble-sent'] = '330 90% 55%';
    base.light['chart-1'] = '330 90% 55%';
    base.light['chart-9'] = '160 85% 45%';
    base.light['chart-status-open'] = '130 70% 45%';

    base.swatches = ['hsl(0 85% 55%)', 'hsl(55 90% 50%)', 'hsl(130 70% 45%)', 'hsl(280 80% 58%)'];
    return base;
  })(),
];

export const STORAGE_KEY = 'theme-custom-colors';
export const STORAGE_VERSION = 3;
export const DEFAULT_PRESET_ID = 'corporate';

const DEPRECATED_PRESET_IDS = new Set(['default', 'purpure']);

export function normalizeStoredPresetId(presetId?: string | null): string {
  if (!presetId || DEPRECATED_PRESET_IDS.has(presetId)) {
    return DEFAULT_PRESET_ID;
  }

  return PRESETS.some((preset) => preset.id === presetId) ? presetId : DEFAULT_PRESET_ID;
}
