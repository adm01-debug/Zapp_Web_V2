/**
 * Sistema de skins — 10 clássicas + 9 Opera GX + Diversity.
 *
 * Porta a arquitetura de `Promo_Gifts_V4/src/lib/theme-presets.ts` (paridade
 * visual documentada em docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md),
 * estendida para os tokens que o Zapp já tinha (tonal primary-50…950,
 * kpi-tile-blue, chat-*, xp, status-open) e adaptada ao boot com cache de
 * CSS vars do Zapp (`useTheme` com light/dark/system — o PG é dark-only).
 *
 * Cada skin define as duas paletas (light e dark); trocar o Modo de Cor
 * sempre reaplica o par certo, nunca mistura.
 */

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface ThemeModeColors {
  // Superfícies e neutros
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  'card-elevated': string;
  popover: string;
  'popover-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  border: string;
  input: string;
  surface: string;
  'surface-hover': string;
  divider: string;
  'sidebar-background': string;
  'sidebar-foreground': string;
  'sidebar-accent': string;
  'sidebar-accent-foreground': string;
  'sidebar-border': string;
  'chat-bubble-received': string;
  'chat-bubble-received-foreground': string;
  'chat-header': string;
  'chat-input-bg': string;
  elevated: string;
  'elevated-hover': string;
  'glass-bg': string;
  'glass-border': string;
  'gradient-surface': string;
  'gradient-divider': string;
  'shadow-lg': string;
  'shadow-xl': string;
  'shadow-header': string;

  // Derivados da primária
  primary: string;
  'primary-foreground': string;
  'primary-glow': string;
  'primary-hover': string;
  'primary-active': string;
  ring: string;
  'sidebar-primary': string;
  'sidebar-primary-foreground': string;
  'sidebar-ring': string;
  'chat-bubble-sent': string;
  'chat-bubble-sent-foreground': string;
  'status-open': string;
  'chart-status-open': string;
  xp: string;
  'xp-foreground': string;
  'chart-1': string;
  'border-strong': string;
  'gradient-primary': string;
  'gradient-secondary': string;
  'gradient-xp': string;
  'gradient-vibrant': string;
  'gradient-purple-green': string;
  'shadow-glow-primary': string;
  'shadow-glow-secondary': string;
  'shadow-glow-accent': string;
  'shadow-glow-purple': string;
  'kpi-tile-blue': string;
  'kpi-tile-blue-fg': string;
  'primary-50': string;
  'primary-100': string;
  'primary-200': string;
  'primary-300': string;
  'primary-400': string;
  'primary-500': string;
  'primary-600': string;
  'primary-700': string;
  'primary-800': string;
  'primary-900': string;
  'primary-950': string;
}

/**
 * Tokens semânticos fixos (grupo C) — NÃO entram em `ThemeModeColors` nem em
 * `CSS_VARS_TO_APPLY`. Continuam definidos só em `tokens.css` e não mudam
 * com a skin: destructive*, success*, warning*, info*, status-pending/
 * resolved/waiting, whatsapp*, online/away/offline, unread, coins*,
 * streak*, rank-*, priority-*, kpi-tile-green/purple/yellow(+fg),
 * chart-2…10, chart-status-pending/resolved/waiting, chart-sentiment-*,
 * dash-*, neutral-50…950, elev-*, glow-*, gradient-success,
 * shadow-glow-success. Exceção: a skin `diversity` sobrescreve
 * `gradient-success` (verde→azul pride), como no Promo Gifts.
 *
 * Cobertura profunda (etapas 59-60): inventário de `var(--x)` e classes
 * Tailwind em todo `src/` confirma que os únicos tokens de COR fora de
 * `CSS_VARS_TO_APPLY` e ausentes desta lista são: `shadow-xs/sm/md`
 * (dark é preto puro sem hue; o leve tingimento por hue no light — mesma
 * fórmula do foreground — é imperceptível a 4-7% de opacidade e não
 * compensa a manutenção extra), `foreground-secondary` e `gradient-gold`
 * (constantes independentes do hue, nunca usaram a primária). `glow-*`
 * (glow-primary-sm/md/lg, glow-secondary-*, glow-aura-*, etc.) já mudam
 * sozinhos porque são declarados como `hsl(var(--primary) / X)` em
 * `tokens.css` — não precisam entrar na lista. `neutral-50…950` só tem 1
 * uso no código (`EmailFullViewDialog`, preview de e-mail de terceiros —
 * precisa ficar neutro mesmo, de propósito). Tokens de raio/layout/
 * densidade/tipografia (`--radius-*`, `--sidebar-w*`, `--text-*`,
 * `--density-*`, `--contrast-multiplier`, `--layout-*`) não são cor e
 * nunca fizeram parte deste sistema.
 */
export const FIXED_TOKENS = [
  'destructive', 'destructive-foreground',
  'success', 'success-foreground', 'warning', 'warning-foreground', 'info', 'info-foreground',
  'status-pending', 'status-resolved', 'status-waiting',
  'whatsapp', 'whatsapp-dark', 'online', 'away', 'offline', 'unread',
  'coins', 'coins-foreground', 'streak', 'streak-foreground',
  'rank-gold', 'rank-gold-foreground', 'rank-silver', 'rank-silver-foreground', 'rank-bronze', 'rank-bronze-foreground',
  'priority-high', 'priority-medium', 'priority-low',
  'kpi-tile-green', 'kpi-tile-green-fg', 'kpi-tile-purple', 'kpi-tile-purple-fg', 'kpi-tile-yellow', 'kpi-tile-yellow-fg',
  'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8', 'chart-9', 'chart-10',
  'chart-status-pending', 'chart-status-resolved', 'chart-status-waiting',
  'chart-sentiment-positive', 'chart-sentiment-neutral', 'chart-sentiment-negative',
  'gradient-success', 'shadow-glow-success',
  'shadow-xs', 'shadow-sm', 'shadow-md', 'foreground-secondary', 'gradient-gold',
] as const;

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  category: 'classic' | 'gx';
  /** Raio sugerido (px). Definido só nos GX (10); ausente nas clássicas (usa o default do usuário). */
  borderRadius?: number;
  /** Família de fonte sugerida. Nenhuma skin declara hoje (ver D1 do plano) — campo reservado. */
  font?: string;
  swatches: [string, string, string, string];
  light: ThemeModeColors;
  dark: ThemeModeColors;
}

interface PresetParams {
  id: string;
  name: string;
  description: string;
  emoji: string;
  h: number;
  s: number;
  l: number;
  gh: number;
  sh: number;
  ss: number;
  sl: number;
}

// ─── Escala tonal (primary-50…950) ─────────────────────────────────────────
// Tabelas fixas de [saturação, luminância] por degrau (só o hue muda por skin).

const TONAL_LIGHT: [number, number][] = [
  [100, 97], [95, 93], [92, 86], [90, 76], [87, 64], [83, 53], [83, 46], [80, 38], [75, 30], [70, 22], [65, 14],
];
const TONAL_DARK: [number, number][] = [
  [60, 14], [65, 18], [70, 24], [75, 32], [80, 42], [83, 53], [87, 62], [90, 72], [92, 82], [95, 90], [100, 96],
];
const TONAL_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

function tonal(h: number, table: [number, number][]): Record<string, string> {
  const out: Record<string, string> = {};
  TONAL_STEPS.forEach((step, i) => {
    const [s, l] = table[i];
    out[`primary-${step}`] = `${h} ${s}% ${l}%`;
  });
  return out;
}

// ─── Preset factory (skins clássicas) ──────────────────────────────────────

function buildPreset(p: PresetParams): ThemePreset {
  const { h, s, l, gh, sh, ss, sl } = p;
  const primary = `${h} ${s}% ${l}%`;
  const primaryHover = `${h} ${s}% ${Math.max(l - 5, 5)}%`;
  const primaryActive = `${h} ${s}% ${Math.max(l - 10, 5)}%`;
  const primaryGlow = `${gh} ${s}% ${Math.min(l + 10, 95)}%`;
  const secondary = `${sh} ${ss}% ${sl}%`;
  const secondaryLight2 = `${sh} ${ss}% ${Math.min(sl + 10, 95)}%`;

  const light: ThemeModeColors = {
    background: `${h} 20% 97%`,
    foreground: `${h} 20% 12%`,
    card: '0 0% 100%',
    'card-foreground': `${h} 20% 12%`,
    'card-elevated': '0 0% 100%',
    popover: '0 0% 100%',
    'popover-foreground': `${h} 20% 12%`,
    secondary,
    'secondary-foreground': '210 40% 92%',
    muted: `${h} 15% 92%`,
    'muted-foreground': `${h} 10% 45%`,
    accent: `${h} 55% 95%`,
    'accent-foreground': `${h} ${s}% ${Math.max(l - 8, 5)}%`,
    border: `${h} 15% 90%`,
    input: `${h} 15% 93%`,
    // BUG-THEME (pré-existente, fora de escopo): --surface/--divider/--border-strong
    // usam os valores dark também no modo claro. Replicado de propósito (seção 4 do plano).
    surface: '240 5% 9%',
    'surface-hover': '240 5% 12%',
    divider: '240 4% 20%',
    'sidebar-background': '0 0% 100%',
    'sidebar-foreground': `${h} 20% 12%`,
    'sidebar-accent': `${h} 50% 96%`,
    'sidebar-accent-foreground': `${h} ${s}% ${Math.max(l - 8, 5)}%`,
    'sidebar-border': `${h} 15% 92%`,
    'chat-bubble-received': `${h} 15% 95%`,
    'chat-bubble-received-foreground': `${h} 20% 15%`,
    'chat-header': '0 0% 100%',
    'chat-input-bg': '0 0% 100%',
    elevated: '0 0% 100%',
    'elevated-hover': `${h} 20% 97%`,
    'glass-bg': '0 0% 100% / 1',
    'glass-border': `${h} 15% 88% / 1`,
    'gradient-surface': `linear-gradient(180deg, hsl(${h} 20% 97%), hsl(${h} 15% 95%))`,
    'gradient-divider': `linear-gradient(90deg, transparent, hsl(${h} 15% 88% / 0.5), transparent)`,
    'shadow-lg': `0 10px 15px -3px hsl(${h} 20% 12% / 0.08), 0 4px 6px -4px hsl(${h} 20% 12% / 0.05)`,
    'shadow-xl': `0 20px 25px -5px hsl(${h} 20% 12% / 0.1), 0 8px 10px -6px hsl(${h} 20% 12% / 0.06)`,
    'shadow-header': `0 1px 3px hsl(${h} 20% 12% / 0.06)`,

    primary,
    'primary-foreground': '0 0% 100%',
    'primary-glow': primaryGlow,
    'primary-hover': primaryHover,
    'primary-active': primaryActive,
    ring: primary,
    'sidebar-primary': primary,
    'sidebar-primary-foreground': '0 0% 100%',
    'sidebar-ring': primary,
    'chat-bubble-sent': primary,
    'chat-bubble-sent-foreground': '0 0% 100%',
    'status-open': primary,
    'chart-status-open': primary,
    xp: primary,
    'xp-foreground': '0 0% 100%',
    'chart-1': primary,
    'border-strong': `${primary} / 0.55`,
    'gradient-primary': `linear-gradient(135deg, hsl(${primary}), hsl(${primaryGlow}))`,
    'gradient-secondary': `linear-gradient(135deg, hsl(${secondary}), hsl(${secondaryLight2}))`,
    'gradient-xp': `linear-gradient(90deg, hsl(${primary}), hsl(${primaryGlow}))`,
    'gradient-vibrant': `linear-gradient(135deg, hsl(${primary}), hsl(${gh} 95% 62%), hsl(${primaryGlow}))`,
    'gradient-purple-green': `linear-gradient(135deg, hsl(${primary}), hsl(160 70% 42%))`,
    'shadow-glow-primary': `0 4px 14px hsl(${primary} / 0.25)`,
    'shadow-glow-secondary': `0 4px 14px hsl(${secondary} / 0.2)`,
    'shadow-glow-accent': `0 4px 14px hsl(${primaryGlow} / 0.25)`,
    'shadow-glow-purple': `0 4px 14px hsl(${primary} / 0.3)`,
    'kpi-tile-blue': `${primary} / 0.13`,
    'kpi-tile-blue-fg': `${h} ${s}% 72%`,
    ...(tonal(h, TONAL_LIGHT) as Pick<ThemeModeColors, `primary-${typeof TONAL_STEPS[number]}`>),
  };

  const dark: ThemeModeColors = {
    background: '240 6% 6%',
    foreground: '210 40% 98%',
    card: '240 5% 10%',
    'card-foreground': '210 40% 98%',
    'card-elevated': '240 5% 13%',
    popover: '240 5% 10%',
    'popover-foreground': '210 40% 98%',
    secondary: '240 5% 16%',
    'secondary-foreground': '0 0% 100%',
    muted: '240 4% 18%',
    'muted-foreground': '215 20% 75%',
    accent: '240 5% 16%',
    'accent-foreground': '210 40% 98%',
    border: '240 4% 18%',
    input: '240 5% 14%',
    surface: '240 5% 9%',
    'surface-hover': '240 5% 12%',
    divider: '240 4% 20%',
    'sidebar-background': '240 6% 5%',
    'sidebar-foreground': '210 40% 98%',
    'sidebar-accent': '240 5% 12%',
    'sidebar-accent-foreground': '210 40% 98%',
    'sidebar-border': '240 4% 14%',
    'chat-bubble-received': '240 4% 18%',
    'chat-bubble-received-foreground': '0 0% 97%',
    'chat-header': '240 5% 10%',
    'chat-input-bg': '240 5% 9%',
    elevated: '240 5% 12%',
    'elevated-hover': '240 5% 15%',
    'glass-bg': '240 6% 8% / 0.85',
    'glass-border': `${h} 30% 30% / 0.15`,
    'gradient-surface': 'linear-gradient(180deg, hsl(240 5% 10%), hsl(240 6% 6%))',
    'gradient-divider': `linear-gradient(90deg, transparent, hsl(${h} 50% 40% / 0.15), transparent)`,
    'shadow-lg': `0 10px 15px -3px hsl(225 20% 2% / 0.7), 0 4px 6px -4px hsl(225 20% 2% / 0.5), 0 0 20px hsl(${primary} / 0.04)`,
    'shadow-xl': `0 20px 25px -5px hsl(225 20% 2% / 0.8), 0 8px 10px -6px hsl(225 20% 2% / 0.6), 0 0 30px hsl(${primary} / 0.06)`,
    'shadow-header': `0 1px 3px hsl(225 20% 2% / 0.7), 0 0 20px hsl(${primary} / 0.03), inset 0 1px 0 hsl(225 15% 18% / 0.3)`,

    primary,
    'primary-foreground': '0 0% 100%',
    'primary-glow': primaryGlow,
    'primary-hover': primaryHover,
    'primary-active': primaryActive,
    ring: primary,
    'sidebar-primary': primary,
    'sidebar-primary-foreground': '0 0% 100%',
    'sidebar-ring': primary,
    'chat-bubble-sent': primary,
    'chat-bubble-sent-foreground': '0 0% 100%',
    'status-open': primary,
    'chart-status-open': primary,
    xp: primary,
    'xp-foreground': '0 0% 100%',
    'chart-1': primary,
    'border-strong': `${primary} / 0.55`,
    'gradient-primary': `linear-gradient(135deg, hsl(${primary}), hsl(${primaryGlow}))`,
    'gradient-secondary': `linear-gradient(135deg, hsl(${secondary}), hsl(${secondaryLight2}))`,
    'gradient-xp': `linear-gradient(90deg, hsl(${primary}), hsl(${primaryGlow}))`,
    'gradient-vibrant': `linear-gradient(135deg, hsl(${primary}), hsl(${gh} 95% 62%), hsl(${primaryGlow}))`,
    'gradient-purple-green': `linear-gradient(135deg, hsl(${primary}), hsl(155 80% 50%))`,
    'shadow-glow-primary': `0 0 30px hsl(${primary} / 0.4), 0 0 60px hsl(${primary} / 0.15)`,
    'shadow-glow-secondary': `0 4px 24px hsl(${secondary} / 0.4)`,
    'shadow-glow-accent': `0 4px 24px hsl(${primaryGlow} / 0.4)`,
    'shadow-glow-purple': `0 4px 24px hsl(${primary} / 0.5)`,
    'kpi-tile-blue': `${primary} / 0.13`,
    'kpi-tile-blue-fg': `${h} ${s}% 72%`,
    ...(tonal(h, TONAL_DARK) as Pick<ThemeModeColors, `primary-${typeof TONAL_STEPS[number]}`>),
  };

  const swatches: [string, string, string, string] = [
    `hsl(${h} ${s}% ${l}%)`,
    `hsl(${sh} ${ss}% ${sl}%)`,
    `hsl(${gh} ${Math.max(s - 5, 0)}% ${Math.min(l + 6, 100)}%)`,
    `hsl(${h} ${Math.round(s * 0.5)}% ${Math.min(l + 15, 100)}%)`,
  ];

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    emoji: p.emoji,
    category: 'classic',
    swatches,
    light,
    dark,
  };
}

// ─── CSS_VARS_TO_APPLY — congelado, mesmo conjunto de ThemeModeColors ──────

export const CSS_VARS_TO_APPLY = [
  'background', 'foreground', 'card', 'card-foreground', 'card-elevated', 'popover', 'popover-foreground',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground',
  'border', 'input', 'surface', 'surface-hover', 'divider',
  'sidebar-background', 'sidebar-foreground', 'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border',
  'chat-bubble-received', 'chat-bubble-received-foreground', 'chat-header', 'chat-input-bg',
  'elevated', 'elevated-hover', 'glass-bg', 'glass-border', 'gradient-surface', 'gradient-divider',
  'shadow-lg', 'shadow-xl', 'shadow-header',
  'primary', 'primary-foreground', 'primary-glow', 'primary-hover', 'primary-active', 'ring',
  'sidebar-primary', 'sidebar-primary-foreground', 'sidebar-ring',
  'chat-bubble-sent', 'chat-bubble-sent-foreground', 'status-open', 'chart-status-open', 'xp', 'xp-foreground',
  'chart-1', 'border-strong', 'gradient-primary', 'gradient-secondary', 'gradient-xp', 'gradient-vibrant',
  'gradient-purple-green', 'shadow-glow-primary', 'shadow-glow-secondary', 'shadow-glow-accent', 'shadow-glow-purple',
  'kpi-tile-blue', 'kpi-tile-blue-fg',
  'primary-50', 'primary-100', 'primary-200', 'primary-300', 'primary-400', 'primary-500',
  'primary-600', 'primary-700', 'primary-800', 'primary-900', 'primary-950',
] as const satisfies readonly (keyof ThemeModeColors)[];

// ─── Diversity (Pride) ──────────────────────────────────────────────────────

const PRIDE_RED = '0 85% 55%';
const PRIDE_ORANGE = '30 90% 55%';
const PRIDE_YELLOW = '55 90% 50%';
const PRIDE_GREEN = '130 70% 45%';
const PRIDE_BLUE = '210 80% 55%';
const PRIDE_PURPLE = '280 80% 58%';
const PRIDE_PINK = '330 85% 52%';

const rainbowGrad = `linear-gradient(135deg, hsl(${PRIDE_RED}), hsl(${PRIDE_ORANGE}), hsl(${PRIDE_YELLOW}), hsl(${PRIDE_GREEN}), hsl(${PRIDE_BLUE}), hsl(${PRIDE_PURPLE}))`;
const rainbowDivider = `linear-gradient(90deg, hsl(${PRIDE_RED} / 0.5), hsl(${PRIDE_YELLOW} / 0.5), hsl(${PRIDE_GREEN} / 0.5), hsl(${PRIDE_BLUE} / 0.5), hsl(${PRIDE_PURPLE} / 0.5))`;

function buildDiversityPreset(): ThemePreset {
  const base = buildPreset({
    id: 'diversity',
    name: 'Diversity',
    description: 'Pride 🏳️‍🌈 — celebrando a comunidade LGBTQIA+',
    emoji: '🏳️‍🌈',
    h: 330, s: 85, l: 55, gh: 290, sh: 130, ss: 70, sl: 45,
  });

  const lightPrimary = PRIDE_PINK;
  const darkPrimary = '330 85% 60%';

  return {
    ...base,
    swatches: [`hsl(${PRIDE_RED})`, `hsl(${PRIDE_YELLOW})`, `hsl(${PRIDE_GREEN})`, `hsl(${PRIDE_PURPLE})`],
    light: {
      ...base.light,
      primary: lightPrimary,
      'primary-foreground': '0 0% 100%',
      'primary-hover': '330 85% 50%',
      'primary-active': '330 85% 45%',
      'primary-glow': '290 85% 60%',
      ring: lightPrimary,
      'sidebar-primary': lightPrimary,
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': lightPrimary,
      'chat-bubble-sent': lightPrimary,
      'status-open': lightPrimary,
      'chart-status-open': lightPrimary,
      xp: lightPrimary,
      'chart-1': lightPrimary,
      'kpi-tile-blue': `${lightPrimary} / 0.13`,
      'kpi-tile-blue-fg': '330 85% 72%',
      secondary: PRIDE_GREEN,
      'secondary-foreground': '0 0% 100%',
      accent: '55 100% 94%',
      'accent-foreground': '20 80% 25%',
      'sidebar-accent': '290 50% 96%',
      'sidebar-accent-foreground': '290 80% 35%',
      'sidebar-border': '330 40% 92%',
      'gradient-primary': rainbowGrad,
      'gradient-secondary': rainbowGrad,
      'gradient-vibrant': rainbowGrad,
      'gradient-purple-green': rainbowGrad,
      'gradient-divider': rainbowDivider,
      'gradient-surface': 'linear-gradient(180deg, hsl(330 30% 98%), hsl(280 20% 96%))',
      'shadow-glow-primary': `0 0 24px hsl(${lightPrimary} / 0.3)`,
      'shadow-glow-secondary': `0 0 24px hsl(${PRIDE_GREEN} / 0.25)`,
      'shadow-glow-accent': `0 0 24px hsl(${PRIDE_YELLOW} / 0.35)`,
      'shadow-glow-purple': `0 0 24px hsl(${PRIDE_PURPLE} / 0.3)`,
      'gradient-success': `linear-gradient(135deg, hsl(${PRIDE_GREEN}), hsl(${PRIDE_BLUE}))`,
    } as ThemeModeColors,
    dark: {
      ...base.dark,
      primary: darkPrimary,
      'primary-foreground': '0 0% 100%',
      'primary-hover': '330 85% 55%',
      'primary-active': '330 85% 50%',
      'primary-glow': '290 85% 65%',
      ring: darkPrimary,
      'sidebar-primary': darkPrimary,
      'sidebar-primary-foreground': '0 0% 100%',
      'sidebar-ring': darkPrimary,
      'chat-bubble-sent': darkPrimary,
      'status-open': darkPrimary,
      'chart-status-open': darkPrimary,
      xp: darkPrimary,
      'chart-1': darkPrimary,
      'kpi-tile-blue': `${darkPrimary} / 0.13`,
      'kpi-tile-blue-fg': '330 85% 72%',
      secondary: PRIDE_GREEN,
      'secondary-foreground': '0 0% 100%',
      accent: '280 50% 22%',
      'accent-foreground': '290 85% 78%',
      'sidebar-accent': '280 50% 18%',
      'sidebar-accent-foreground': '290 85% 78%',
      'sidebar-border': '330 30% 18%',
      'gradient-primary': rainbowGrad,
      'gradient-secondary': rainbowGrad,
      'gradient-vibrant': rainbowGrad,
      'gradient-purple-green': rainbowGrad,
      'gradient-divider': rainbowDivider,
      'gradient-surface': 'linear-gradient(180deg, hsl(280 25% 9%), hsl(330 20% 6%))',
      'shadow-glow-primary': `0 0 30px hsl(${darkPrimary} / 0.4), 0 0 60px hsl(${PRIDE_PURPLE} / 0.18)`,
      'shadow-glow-secondary': `0 0 28px hsl(${PRIDE_GREEN} / 0.4)`,
      'shadow-glow-accent': `0 0 28px hsl(${PRIDE_YELLOW} / 0.4)`,
      'shadow-glow-purple': `0 0 28px hsl(${PRIDE_PURPLE} / 0.4)`,
      'gradient-success': `linear-gradient(135deg, hsl(${PRIDE_GREEN}), hsl(${PRIDE_BLUE}))`,
    } as ThemeModeColors,
  };
}

// ─── Pipeline Opera GX ──────────────────────────────────────────────────────

function applyGxDarkSurfaces(preset: ThemePreset): ThemePreset {
  const d = preset.dark;
  d.background = '265 22% 8%';
  d.card = '265 22% 12%';
  d['card-elevated'] = '265 18% 17%';
  d.popover = '265 22% 14%';
  d.muted = '265 18% 17%';
  d.input = '265 18% 17%';
  d.border = '265 18% 22%';
  d.secondary = '265 18% 17%';
  d.accent = '265 18% 17%';
  d.surface = '265 22% 10%';
  d['surface-hover'] = '265 18% 17%';
  d.divider = '265 18% 22%';
  d['sidebar-background'] = '265 24% 10%';
  d['sidebar-accent'] = '265 18% 17%';
  d['sidebar-border'] = '265 18% 20%';
  d.elevated = '265 18% 17%';
  d['elevated-hover'] = '265 18% 22%';
  d['gradient-surface'] = 'linear-gradient(180deg, hsl(265 22% 12%), hsl(265 24% 8%))';
  d['chat-header'] = '265 22% 12%';
  d['chat-input-bg'] = '265 22% 10%';
  d['chat-bubble-received'] = '265 18% 17%';
  d.foreground = '210 40% 98%';
  d['muted-foreground'] = '215 20% 75%';
  return preset;
}

function boostGlowAlpha(shadow: string, alpha: number): string {
  return shadow.replace(/\/\s*[0-9.]+\s*\)/, `/ ${alpha})`);
}

function applyGxNeonGlow(preset: ThemePreset): ThemePreset {
  const { light, dark } = preset;
  light['shadow-glow-primary'] = boostGlowAlpha(light['shadow-glow-primary'], 0.45);
  light['shadow-glow-secondary'] = boostGlowAlpha(light['shadow-glow-secondary'], 0.4);
  dark['shadow-glow-primary'] = boostGlowAlpha(dark['shadow-glow-primary'], 0.7);
  dark['shadow-glow-secondary'] = boostGlowAlpha(dark['shadow-glow-secondary'], 0.65);
  return preset;
}

function applyGxGlass(preset: ThemePreset, h: number, s: number, l: number): ThemePreset {
  preset.dark['glass-bg'] = '265 22% 12% / 0.55';
  preset.light['glass-bg'] = '0 0% 100% / 0.55';
  preset.dark['glass-border'] = `${h} ${Math.min(100, s + 5)}% ${l}% / 0.5`;
  preset.light['glass-border'] = `${h} ${Math.min(100, s + 5)}% ${l}% / 0.5`;
  return preset;
}

function buildGxPreset(p: PresetParams): ThemePreset {
  const preset = applyGxGlass(applyGxNeonGlow(applyGxDarkSurfaces(buildPreset(p))), p.h, p.s, p.l);
  preset.category = 'gx';
  preset.borderRadius = 10;
  return preset;
}

function withDarkPrimaryFg(preset: ThemePreset): ThemePreset {
  preset.light['primary-foreground'] = '222 25% 10%';
  preset.dark['primary-foreground'] = '222 25% 10%';
  preset.light['sidebar-primary-foreground'] = '222 25% 10%';
  preset.dark['sidebar-primary-foreground'] = '222 25% 10%';
  return preset;
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

export const THEME_PRESETS: ThemePreset[] = [
  buildPreset({ id: 'corporate', name: 'Padrão', emoji: '💼', description: 'Azul profissional', h: 221, s: 83, l: 53, gh: 230, sh: 215, ss: 70, sl: 55 }),
  buildPreset({ id: 'purpure', name: 'Púrpure', emoji: '💜', description: 'Roxo vibrante', h: 254, s: 92, l: 55, gh: 260, sh: 260, ss: 90, sl: 67 }),
  buildPreset({ id: 'emerald', name: 'Esmeralda', emoji: '💎', description: 'Verde sofisticado', h: 160, s: 84, l: 35, gh: 170, sh: 145, ss: 70, sl: 50 }),
  buildPreset({ id: 'sunset', name: 'Pôr do Sol', emoji: '🌅', description: 'Quente e acolhedor', h: 25, s: 95, l: 48, gh: 35, sh: 15, ss: 80, sl: 50 }),
  buildPreset({ id: 'rose', name: 'Rosé', emoji: '🌸', description: 'Elegante e moderno', h: 346, s: 77, l: 50, gh: 355, sh: 330, ss: 70, sl: 55 }),
  buildPreset({ id: 'minimal', name: 'Minimal', emoji: '⚪', description: 'Clean e neutro', h: 220, s: 15, l: 50, gh: 220, sh: 220, ss: 10, sl: 45 }),
  buildPreset({ id: 'ocean', name: 'Oceano', emoji: '🌊', description: 'Azul profundo', h: 200, s: 85, l: 48, gh: 210, sh: 190, ss: 75, sl: 50 }),
  buildPreset({ id: 'amber', name: 'Âmbar', emoji: '✨', description: 'Dourado e premium', h: 38, s: 92, l: 42, gh: 45, sh: 30, ss: 80, sl: 55 }),
  buildPreset({ id: 'cyber', name: 'Cyber', emoji: '🤖', description: 'Neon futurista', h: 180, s: 100, l: 30, gh: 300, sh: 320, ss: 100, sl: 60 }),
  buildDiversityPreset(),

  buildGxPreset({ id: 'gx-classic', name: 'GX Classic', emoji: '🦈', description: 'Vermelho neon assinatura do Opera GX', h: 347, s: 96, l: 54, gh: 340, sh: 280, ss: 60, sl: 40 }),
  buildGxPreset({ id: 'gx-pink-addiction', name: 'Pink Addiction', emoji: '🍭', description: 'Rosa intenso e viciante', h: 330, s: 95, l: 60, gh: 340, sh: 300, ss: 90, sl: 55 }),
  buildGxPreset({ id: 'gx-purple-haze', name: 'Purple Haze', emoji: '🟣', description: 'Roxo profundo e psicodélico', h: 265, s: 65, l: 50, gh: 275, sh: 245, ss: 70, sl: 55 }),
  withDarkPrimaryFg(buildGxPreset({ id: 'gx-rose-quartz', name: 'Rose Quartz', emoji: '💗', description: 'Rosa quartzo cristalino', h: 345, s: 75, l: 68, gh: 355, sh: 320, ss: 60, sl: 70 })),
  buildGxPreset({ id: 'gx-ultraviolet', name: 'Ultraviolet', emoji: '🔮', description: 'Violeta UV vibrante', h: 271, s: 76, l: 53, gh: 280, sh: 255, ss: 80, sl: 55 }),
  withDarkPrimaryFg(buildGxPreset({ id: 'gx-hackerman', name: 'Hackerman', emoji: '🧑‍💻', description: 'Verde Matrix de hacker', h: 127, s: 65, l: 46, gh: 135, sh: 115, ss: 60, sl: 42 })),
  withDarkPrimaryFg(buildGxPreset({ id: 'gx-frutti-di-mare', name: 'Frutti di Mare', emoji: '🐙', description: 'Azul-petróleo do fundo do mar', h: 182, s: 90, l: 42, gh: 190, sh: 200, ss: 75, sl: 45 })),
  withDarkPrimaryFg(buildGxPreset({ id: 'gx-cyberpunk', name: 'Cyberpunk', emoji: '⚡', description: 'Amarelo neon de Night City', h: 55, s: 100, l: 51, gh: 180, sh: 320, ss: 95, sl: 55 })),
  withDarkPrimaryFg(buildGxPreset({ id: 'gx-razer', name: 'Razer', emoji: '🐍', description: 'Verde RGB Razer Chroma', h: 113, s: 70, l: 51, gh: 120, sh: 100, ss: 60, sl: 48 })),
];

export function getPresetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}

export const classicPresets = THEME_PRESETS.filter((p) => p.category === 'classic');
export const gxPresets = THEME_PRESETS.filter((p) => p.category === 'gx');

// ─── Storage v6 ─────────────────────────────────────────────────────────────

export const STORAGE_KEY = 'theme-custom-colors';
export const STORAGE_VERSION = 6;

export interface ThemeConfig {
  preset: string;
  borderRadius: number;
}

const LEGACY_ID_MAP: Record<string, string> = {
  default: 'corporate',
  forest: 'emerald',
  teal: 'cyber',
  purple: 'purpure',
};

export function normalizePresetId(id: unknown): string {
  if (typeof id !== 'string') return 'corporate';
  const mapped = LEGACY_ID_MAP[id] ?? id;
  return getPresetById(mapped) ? mapped : 'corporate';
}

export function getDefaultConfig(): ThemeConfig {
  return { preset: 'corporate', borderRadius: 14 };
}

interface StoredShape {
  v?: number;
  preset?: string;
  borderRadius?: number;
  cacheMode?: 'light' | 'dark';
  cachePreset?: string;
  cssVarsCache?: Record<string, string>;
}

function readStored(): StoredShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredShape) : {};
  } catch {
    return {};
  }
}

function writeStored(patch: StoredShape): boolean {
  try {
    const merged = { ...readStored(), ...patch, v: STORAGE_VERSION };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return true;
  } catch (err) {
    console.error('[presets] falha ao gravar o tema no localStorage', err);
    return false;
  }
}

function clampRadius(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 14;
}

export function loadThemeConfig(): ThemeConfig {
  const stored = readStored();
  if (stored.v !== STORAGE_VERSION && stored.v !== 5) {
    return getDefaultConfig();
  }
  const cfg: ThemeConfig = {
    preset: normalizePresetId(stored.preset),
    borderRadius: clampRadius(stored.borderRadius),
  };
  if (stored.v === 5) {
    // Migra v5 → v6: mantém o raio do usuário, mapeia ids legados, descarta
    // cache antigo (será regravado pelo próximo `applyThemePreset`).
    writeStored({ ...cfg, cacheMode: undefined, cachePreset: undefined, cssVarsCache: undefined });
  }
  return cfg;
}

export function saveThemeConfig(cfg: ThemeConfig): boolean {
  return writeStored(cfg);
}

let _transitionTimer: ReturnType<typeof setTimeout> | null = null;

export function applyThemePreset(
  presetId: string,
  mode: 'light' | 'dark',
  opts: { persistCache?: boolean } = {},
): void {
  const preset = getPresetById(presetId);
  if (!preset) return;

  const root = document.documentElement;
  root.classList.add('theme-transitioning');
  root.dataset.presetId = presetId;

  const colors = preset[mode];
  const cache: Record<string, string> = {};
  for (const key of CSS_VARS_TO_APPLY) {
    const value = colors[key];
    root.style.setProperty(`--${key}`, value);
    cache[key] = value;
  }

  if (preset.borderRadius !== undefined) {
    root.style.setProperty('--radius', `${preset.borderRadius / 16}rem`);
  }
  if (preset.font) {
    root.style.setProperty('--font-sans', preset.font);
    root.style.setProperty('--font-display', preset.font);
  } else {
    root.style.removeProperty('--font-sans');
    root.style.removeProperty('--font-display');
  }

  if (opts.persistCache !== false) {
    writeStored({ cacheMode: mode, cachePreset: presetId, cssVarsCache: cache });
  }

  if (_transitionTimer !== null) clearTimeout(_transitionTimer);
  _transitionTimer = setTimeout(() => {
    root.classList.remove('theme-transitioning');
    _transitionTimer = null;
  }, 500);
}

export function applyRadius(px: number): void {
  const safe = clampRadius(px);
  document.documentElement.style.setProperty('--radius', `${safe / 16}rem`);
}

export function clearThemeOverrides(): void {
  const root = document.documentElement;
  for (const key of CSS_VARS_TO_APPLY) root.style.removeProperty(`--${key}`);
  root.style.removeProperty('--radius');
  root.style.removeProperty('--font-sans');
  root.style.removeProperty('--font-display');
  delete root.dataset.presetId;
  writeStored({ cacheMode: undefined, cachePreset: undefined, cssVarsCache: undefined });
}

export function exportThemeConfig(cfg: ThemeConfig): string {
  return JSON.stringify(cfg, null, 2);
}

export function importThemeConfig(json: string): ThemeConfig | null {
  try {
    const parsed = JSON.parse(json) as Partial<ThemeConfig>;
    if (typeof parsed.preset === 'string' && getPresetById(parsed.preset) && typeof parsed.borderRadius === 'number') {
      return { preset: parsed.preset, borderRadius: clampRadius(parsed.borderRadius) };
    }
  } catch {
    // JSON inválido: import falha silenciosamente
  }
  return null;
}
