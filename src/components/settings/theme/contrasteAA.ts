/**
 * Contraste WCAG 2.1 AA das cores de skin (achado do E18 do plano de volume de mídia).
 *
 * O problema não está em um componente: está na COMBINAÇÃO. As bolhas pintam o texto com
 * `--primary-foreground` **com alfa** (70% no tempo/duração, 50% em ícones) sobre
 * `bg-primary-foreground/10`, e a trilha do slider é `--secondary` contra o range
 * `--primary`. Alfa derruba a razão: branco a 70% sobre um azul médio dá 2,93:1 — reprova.
 *
 * A correção é de TOKEN, não de componente: antes de gravar a skin no `<html>`, o aplicador
 * procura a luminosidade MÍNIMA que faz os pares passarem, na direção que o modo pede —
 * claro: primária mais escura (texto branco); escuro: primária mais clara (texto escuro).
 * A matiz e a saturação da skin (a identidade dela) não mudam: só a luminosidade, e só o
 * necessário. Sem `!important`, sem classe nova, sem tocar em componente.
 *
 * Ajusta: primária (e o que deriva dela: hover/active/glow/ring/gradientes/sombras),
 * cor do texto da primária, secundária do claro (a trilha) com seu texto, e o texto suave
 * do claro (`--muted-foreground`, que é o texto da bolha recebida).
 */

const LIMIAR_TEXTO = 4.5;
const LIMIAR_UI = 3.0;
/** Folga exigida além do limiar: não deixar nenhum par no fio da navalha. */
const MARGEM = 0.05;

/** Tinta escura sobre superfícies claras (mesma família de `withDarkPrimaryFg`). */
export const TINTA_ESCURA = '222 25% 10%';

// ─── Cor: HSL → sRGB, composição alfa e razão WCAG ──────────────────────────

export type Rgb = [number, number, number];

function hslParaRgb(valor: string): Rgb {
  const m = valor.trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) return [0, 0, 0];
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255;
  return [f(0), f(8), f(4)];
}

const linear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

const luminancia = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** Razão WCAG entre duas cores (ou entre duas amostras já compostas). */
export function razaoRgb(a: Rgb, b: Rgb): number {
  const [la, lb] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

export const razao = (a: string, b: string): number => razaoRgb(hslParaRgb(a), hslParaRgb(b));

/** Compõe `cor` com `alfa` sobre `fundo`, em sRGB — igual ao navegador. */
export function compor(cor: string | Rgb, alfa: number, fundo: string | Rgb): Rgb {
  const a = typeof cor === 'string' ? hslParaRgb(cor) : cor;
  const b = typeof fundo === 'string' ? hslParaRgb(fundo) : fundo;
  return a.map((c, i) => c * alfa + b[i] * (1 - alfa)) as Rgb;
}

const lDe = (valor: string): number => {
  const m = valor.trim().match(/[\d.]+%\s*$/);
  return m ? Number.parseFloat(m[0]) : 0;
};

/** Troca a luminosidade mantendo matiz e saturação. */
const comL = (valor: string, l: number): string => {
  const m = valor.trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+[\d.]+%$/);
  return m ? `${m[1]} ${m[2]}% ${l}%` : valor;
};

// ─── Os pares que a skin precisa respeitar ─────────────────────────────────

export interface CoresDeContraste {
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  sidebarBackground: string;
  popover: string;
  popoverForeground: string;
  background: string;
  card: string;
  mutedSurface: string;
  foreground: string;
  accent: string;
}

const menor = (valores: number[]) => valores.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);

/** Bolha enviada (texto e ícones com alfa), botão default e ícone ativo do sidebar. */
function folgaPrimaria(c: CoresDeContraste): number {
  const bolha = compor(c.primaryForeground, 0.1, c.primary);
  const pastilha = compor(c.primaryForeground, 0.2, bolha);
  const sidebar = compor(c.muted, 0.5, c.sidebarBackground);
  const marcador = compor(c.primary, 0.15, c.card); // avatar: bg-primary/15 sobre o card
  return menor([
    razaoRgb(compor(c.primaryForeground, 0.7, bolha), bolha) - LIMIAR_TEXTO, // duração/tempo
    razaoRgb(compor(c.primaryForeground, 0.5, bolha), bolha) - LIMIAR_UI, // ícone a 50%
    razaoRgb(hslParaRgb(c.primaryForeground), pastilha) - LIMIAR_TEXTO, // botão play (pastilha pf/20)
    razao(c.primaryForeground, c.primary) - LIMIAR_TEXTO, // botão default / logo Z
    razaoRgb(hslParaRgb(c.primary), sidebar) - LIMIAR_UI, // ícone ativo do sidebar
    razaoRgb(hslParaRgb(c.primary), marcador) - LIMIAR_TEXTO, // iniciais do avatar (bg-primary/15)
  ]);
}

/** Texto suave: bolha recebida, título do popover e ícone mudo do sidebar. */
function folgaSuave(c: CoresDeContraste): number {
  const recebida = compor(c.muted, 0.5, c.muted);
  const sidebar = compor(c.muted, 0.5, c.sidebarBackground);
  return menor([
    razaoRgb(hslParaRgb(c.mutedForeground), recebida) - LIMIAR_TEXTO, // duração da bolha recebida
    razao(c.mutedForeground, c.popover) - LIMIAR_TEXTO, // título do popover
    razaoRgb(hslParaRgb(c.mutedForeground), sidebar) - LIMIAR_UI, // ícone mudo do sidebar
    razao(c.mutedForeground, c.mutedSurface) - LIMIAR_TEXTO, // atalho de teclado (bg-muted)
    razao(c.foreground, c.accent) - LIMIAR_TEXTO, // chip de status ativo (bg-accent + text-foreground)
  ]);
}

/** Trilha do slider contra o range e botões `secondary` (o overlay de tela cheia). */
function folgaSecundaria(c: CoresDeContraste): number {
  return menor([
    razao(c.primary, c.secondary) - LIMIAR_UI, // slider: range x trilha
    razao(c.secondaryForeground, c.secondary) - LIMIAR_TEXTO, // overlay: botões secondary
  ]);
}

/** Pior folga de TODOS os pares que dependem de primária/secundária/texto suave. */
export function folgaDeContraste(c: CoresDeContraste): number {
  return menor([
    folgaPrimaria(c),
    folgaSuave(c),
    folgaSecundaria(c),
    razao(c.popoverForeground, c.popover) - LIMIAR_TEXTO,
    razao(c.popoverForeground, c.background) - LIMIAR_TEXTO,
  ]);
}

// ─── Ajuste da paleta ──────────────────────────────────────────────────────

/**
 * Devolve a paleta do modo com as cores de contraste ajustadas (só luminosidade).
 * Não mexe no que já passa: cada busca anda na direção que o modo pede e para assim que
 * o par dela passa.
 */
export function coresComContrasteAA(
  cores: Record<string, string>,
  modo: 'light' | 'dark',
): Record<string, string> {
  const ajustada: Record<string, string> = { ...cores };
  const base = (): CoresDeContraste => ({
    primary: ajustada.primary,
    primaryForeground: ajustada['primary-foreground'],
    secondary: ajustada.secondary,
    secondaryForeground: ajustada['secondary-foreground'],
    muted: ajustada.muted,
    mutedForeground: ajustada['muted-foreground'],
    sidebarBackground: ajustada['sidebar-background'],
    popover: ajustada.popover,
    popoverForeground: ajustada['popover-foreground'],
    background: ajustada.background,
    card: ajustada.card,
    mutedSurface: ajustada.muted,
    foreground: ajustada.foreground,
    accent: ajustada.accent,
  });

  const primariaOriginal = ajustada.primary;
  const secundariaOriginal = ajustada.secondary;
  const suaveOriginal = ajustada['muted-foreground'];

  // 1. Texto suave do claro: escurece até a bolha recebida (e o título do popover) passar.
  if (modo === 'light' && folgaSuave(base()) < MARGEM) {
    for (let l = Math.round(lDe(suaveOriginal)); l >= 5; l -= 1) {
      ajustada['muted-foreground'] = comL(suaveOriginal, l);
      if (folgaSuave(base()) >= MARGEM) break;
    }
  }

  // 2. Cor do texto sobre a primária: branco no claro, tinta escura no escuro (primária clara).
  ajustada['primary-foreground'] = modo === 'light' ? '0 0% 100%' : TINTA_ESCURA;

  // 3. Primária: anda para o extremo que o modo pede até a família da bolha/sidebar passar.
  const inicial = Math.round(lDe(primariaOriginal));
  if (folgaPrimaria(base()) < MARGEM) {
    const faixa = modo === 'light'
      ? Array.from({ length: inicial }, (_, i) => inicial - i) // escurece
      : Array.from({ length: 99 - inicial }, (_, i) => inicial + i + 1); // clareia
    for (const l of faixa.filter((v) => v > 0 && v < 100)) {
      ajustada.primary = comL(primariaOriginal, l);
      if (folgaPrimaria(base()) >= MARGEM) break;
    }
  }

  // 4. Trilha do claro: clareia até separar da primária (slider) e passar com o texto dela.
  if (modo === 'light') {
    ajustada['secondary-foreground'] = TINTA_ESCURA;
    if (folgaSecundaria(base()) < MARGEM) {
      for (let l = Math.round(lDe(secundariaOriginal)); l <= 99; l += 1) {
        ajustada.secondary = comL(secundariaOriginal, l);
        if (folgaSecundaria(base()) >= MARGEM) break;
      }
    }
  }

  // 5. Propaga os valores novos para quem deriva deles: primeiro os TONS da mesma
  //    matiz/saturação (hover/active/glow da primária), deslocando a luminosidade pelo
  //    mesmo delta — assim `--primary-hover` continua sendo "primária menos N"; depois as
  //    strings que embutem o valor (gradientes, sombras, chat-bubble-sent).
  // Só a FAMÍLIA da primária anda junto: um tom com a mesma matiz/saturação pode ser
  // outra coisa (no `minimal`, o texto suave compartilha a matiz da primária — deslocá-lo
  // destruiria a correção do passo 1).
  const FAMILIA_PRIMARIA = new Set([
    'primary-hover', 'primary-active', 'primary-glow', 'ring', 'sidebar-primary', 'sidebar-ring',
    'chat-bubble-sent', 'border-strong', 'kpi-tile-blue', 'kpi-tile-blue-fg',
  ]);
  /** Rampas tonais (--primary-500, --accent-200…): escala de design, NÃO seguem o ajuste. */
  const RAMPA_TONAL = /^(?:primary|secondary|accent|neutral|success|warning|destructive|info)-\d{2,3}$/;
  const tomDaPrimaria = primariaOriginal.trim().match(/^(-?[\d.]+)\s+([\d.]+)%/);
  const delta = lDe(ajustada.primary) - lDe(primariaOriginal);
  if (tomDaPrimaria && delta !== 0) {
    for (const [chave, valor] of Object.entries(ajustada)) {
      if (chave === 'primary' || typeof valor !== 'string') continue;
      const m = valor.trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
      if (m && m[1] === tomDaPrimaria[1] && m[2] === tomDaPrimaria[2] && FAMILIA_PRIMARIA.has(chave)) {
        ajustada[chave] = comL(valor, Math.min(Math.max(lDe(valor) + delta, 0), 100));
      }
    }
  }
  const propaga = (de: string, para: string, exceto: string) => {
    if (de === para) return;
    for (const [chave, valor] of Object.entries(ajustada)) {
      if (chave === exceto || RAMPA_TONAL.test(chave)) continue;
      if (typeof valor === 'string' && valor.includes(de)) {
        ajustada[chave] = valor.split(de).join(para);
      }
    }
  };
  propaga(primariaOriginal, ajustada.primary, 'primary');
  if (modo === 'light') propaga(secundariaOriginal, ajustada.secondary, 'secondary');

  return ajustada;
}
