/**
 * Built-in colour presets for the theme selector.
 *
 * Each preset defines colors for BOTH light and dark modes,
 * so switching between light/dark always looks intentional.
 *
 * Adding a preset:
 *  1. Add an entry to PRESETS (copy an existing one)
 *  2. Give it a unique id, label, and a base hue
 *  3. The factory function `buildPreset` handles the rest
 */

export interface ThemeModeColors {
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  'card-elevated': string;
  popover: string;
  'popover-foreground': string;
  primary: string;
  'primary-foreground': string;
  'primary-glow': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  destructive: string;
  'destructive-foreground': string;
  border: string;
  input: string;
  ring: string;
  success: string;
  'success-foreground': string;
  warning: string;
  'warning-foreground': string;
  info: string;
  'info-foreground': string;
  'sidebar-background': string;
  'sidebar-foreground': string;
  'sidebar-primary': string;
  'sidebar-primary-foreground': string;
  'sidebar-accent': string;
  'sidebar-accent-foreground': string;
  'sidebar-border': string;
  'sidebar-ring': string;
  'chat-bubble-sent': string;
  'chat-bubble-sent-foreground': string;
  'chat-bubble-received': string;
  'chat-bubble-received-foreground': string;
  'chat-header': string;
  'chat-input-bg': string;
  'status-open': string;
  'status-pending': string;
  'status-resolved': string;
  'status-waiting': string;
  'gradient-primary': string;
  'gradient-surface': string;
  'glass-bg': string;
  elevated: string;
  'elevated-hover': string;
  [key: string]: string;
}

export interface ThemePreset {
  id: string;
  label: string;
  hue: number;
  light: ThemeModeColors;
  dark: ThemeModeColors;
}

const ALL_COLOR_KEYS: (keyof ThemeModeColors)[] = [
  'background', 'foreground',
  'card', 'card-foreground', 'card-elevated',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'primary-glow',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
  'success', 'success-foreground',
  'warning', 'warning-foreground',
  'info', 'info-foreground',
  'sidebar-background', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
  'chat-bubble-sent', 'chat-bubble-sent-foreground',
  'chat-bubble-received', 'chat-bubble-received-foreground',
  'chat-header', 'chat-input-bg',
  'status-open', 'status-pending', 'status-resolved', 'status-waiting',
  'gradient-primary', 'gradient-surface', 'glass-bg',
  'elevated', 'elevated-hover',
];

// Exported alias — consumed by ThemeInitializer.tsx and useThemePreset.ts
export const CSS_VARS_TO_APPLY = ALL_COLOR_KEYS;

// ─── Preset factory ─────────────────────────────────────────────────────────

function buildPreset(id: string, label: string, h: number): ThemePreset {
  const light: ThemeModeColors = {
    background: `${h} 20% 97%`,
    foreground: `${h} 30% 10%`,
    card: `0 0% 100%`,
    'card-foreground': `${h} 30% 10%`,
    'card-elevated': `${h} 20% 99%`,
    popover: `0 0% 100%`,
    'popover-foreground': `${h} 30% 10%`,
    primary: `${h} 83% 53%`,
    'primary-foreground': `0 0% 100%`,
    'primary-glow': `${h} 83% 68%`,
    secondary: `${h} 60% 62%`,
    'secondary-foreground': `0 0% 100%`,
    muted: `${h} 20% 94%`,
    'muted-foreground': `${h} 15% 46%`,
    accent: `${h} 20% 94%`,
    'accent-foreground': `${h} 30% 10%`,
    destructive: `0 84% 60%`,
    'destructive-foreground': `0 0% 100%`,
    border: `${h} 20% 88%`,
    input: `${h} 20% 94%`,
    ring: `${h} 83% 53%`,
    success: `155 70% 42%`,
    'success-foreground': `0 0% 100%`,
    warning: `38 92% 50%`,
    'warning-foreground': `0 0% 8%`,
    info: `${h} 60% 62%`,
    'info-foreground': `0 0% 100%`,
    'sidebar-background': `${h} 15% 95%`,
    'sidebar-foreground': `${h} 30% 15%`,
    'sidebar-primary': `${h} 83% 53%`,
    'sidebar-primary-foreground': `0 0% 100%`,
    'sidebar-accent': `${h} 30% 88%`,
    'sidebar-accent-foreground': `${h} 30% 10%`,
    'sidebar-border': `${h} 20% 85%`,
    'sidebar-ring': `${h} 83% 53%`,
    'chat-bubble-sent': `${h} 83% 53%`,
    'chat-bubble-sent-foreground': `0 0% 100%`,
    'chat-bubble-received': `${h} 20% 94%`,
    'chat-bubble-received-foreground': `${h} 30% 10%`,
    'chat-header': `${h} 15% 96%`,
    'chat-input-bg': `0 0% 100%`,
    'status-open': `${h} 83% 53%`,
    'status-pending': `38 92% 50%`,
    'status-resolved': `155 70% 42%`,
    'status-waiting': `${h} 60% 62%`,
    'gradient-primary': `linear-gradient(135deg, hsl(${h} 83% 53%), hsl(${h + 10} 78% 57%))`,
    'gradient-surface': `linear-gradient(180deg, hsl(0 0% 100%), hsl(${h} 20% 97%))`,
    'glass-bg': `${h} 20% 97% / 1`,
    elevated: `0 0% 100%`,
    'elevated-hover': `${h} 20% 97%`,
  };

  const dark: ThemeModeColors = {
    background: `216 54% 5%`,
    foreground: `210 40% 98%`,
    card: `215 50% 10%`,
    'card-foreground': `210 40% 98%`,
    'card-elevated': `215 52% 13%`,
    popover: `214 52% 9%`,
    'popover-foreground': `210 40% 98%`,
    primary: `213 100% 54%`,
    'primary-foreground': `0 0% 100%`,
    'primary-glow': `213 100% 68%`,
    secondary: `213 94% 62%`,
    'secondary-foreground': `0 0% 100%`,
    muted: `214 49% 14%`,
    'muted-foreground': `215 16% 59%`,
    accent: `214 49% 14%`,
    'accent-foreground': `213 100% 85%`,
    destructive: `354 100% 68%`,
    'destructive-foreground': `0 0% 100%`,
    border: `213 26% 25%`,
    input: `214 42% 13%`,
    ring: `213 100% 54%`,
    success: `161 70% 47%`,
    'success-foreground': `0 0% 100%`,
    warning: `40 91% 60%`,
    'warning-foreground': `0 0% 8%`,
    info: `213 94% 62%`,
    'info-foreground': `0 0% 100%`,
    'sidebar-background': `215 52% 8%`,
    'sidebar-foreground': `210 40% 98%`,
    'sidebar-primary': `213 100% 54%`,
    'sidebar-primary-foreground': `0 0% 100%`,
    'sidebar-accent': `214 49% 16%`,
    'sidebar-accent-foreground': `213 100% 85%`,
    'sidebar-border': `213 26% 25%`,
    'sidebar-ring': `213 100% 54%`,
    'chat-bubble-sent': `213 100% 54%`,
    'chat-bubble-sent-foreground': `0 0% 100%`,
    'chat-bubble-received': `214 49% 14%`,
    'chat-bubble-received-foreground': `0 0% 97%`,
    'chat-header': `215 50% 10%`,
    'chat-input-bg': `214 52% 9%`,
    'status-open': `213 100% 54%`,
    'status-pending': `40 91% 60%`,
    'status-resolved': `155 80% 50%`,
    'status-waiting': `213 94% 62%`,
    'gradient-primary': `linear-gradient(135deg, hsl(213 100% 54%), hsl(220 94% 60%))`,
    'gradient-surface': `linear-gradient(180deg, hsl(215 50% 10%), hsl(216 54% 5%))`,
    'glass-bg': `215 50% 10% / 1`,
    elevated: `215 52% 13%`,
    'elevated-hover': `215 50% 16%`,
  };

  return { id, label, hue: h, light, dark };
}

// ─── Built-in presets ─────────────────────────────────────────────────────────

export const PRESETS: ThemePreset[] = [
  (() => {
    const corporate = buildPreset('corporate', 'Corporativo', 221);
    corporate.dark.primary = '213 100% 54%';
    corporate.dark['primary-glow'] = '213 100% 68%';
    corporate.dark.secondary = '213 94% 62%';
    corporate.dark.ring = '213 100% 54%';
    corporate.dark['sidebar-primary'] = '213 100% 54%';
    corporate.dark['sidebar-ring'] = '213 100% 54%';
    corporate.dark['chat-bubble-sent'] = '213 100% 54%';
    corporate.dark['status-open'] = '213 100% 54%';
    return corporate;
  })(),
  buildPreset('ocean', 'Oceano', 200),
  buildPreset('forest', 'Floresta', 140),
  buildPreset('sunset', 'P\u00f4r do Sol', 20),
  buildPreset('purple', 'Roxo', 270),
  buildPreset('rose', 'Rosa', 340),
  buildPreset('amber', '\u00c2mbar', 38),
  buildPreset('teal', 'Verde-azulado', 175),
];

export const STORAGE_KEY = 'theme-custom-colors';
export const STORAGE_VERSION = 4;
export const DEFAULT_PRESET_ID = 'corporate';

const DEPRECATED_PRESET_IDS = new Set(['default', 'purpure']);

export function normalizeStoredPresetId(presetId?: string | null): string {
  if (!presetId || DEPRECATED_PRESET_IDS.has(presetId)) {
    return DEFAULT_PRESET_ID;
  }
  return presetId;
}

export function applyThemeColors(
  colors: Partial<ThemeModeColors>,
  root: HTMLElement = document.documentElement
): void {
  for (const [key, value] of Object.entries(colors)) {
    if (value !== undefined && value !== null) {
      root.style.setProperty(`--${key}`, value);
    }
  }
}

export function removeThemeColors(
  root: HTMLElement = document.documentElement
): void {
  for (const key of ALL_COLOR_KEYS) {
    root.style.removeProperty(`--${key}`);
  }
}

export function getPresetById(id: string): ThemePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function buildCustomPreset(
  basePreset: ThemePreset,
  customColors: Partial<ThemeModeColors>,
  mode: 'light' | 'dark'
): ThemeModeColors {
  return { ...basePreset[mode], ...customColors };
}
