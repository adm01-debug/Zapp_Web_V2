import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_PRESETS, type ThemeModeColors } from '../../src/components/settings/theme/presets';
import { coresComContrasteAA } from '../../src/components/settings/theme/contrasteAA';

/**
 * Contrato de contraste WCAG 2.1 AA das cores de skin (achado do E18 do plano de
 * volume de mídia: 6 pares reprovavam).
 *
 * O que este contrato prende: as combinações de token que os componentes usam de
 * verdade — inclusive as que passam por ALFA do `--primary-foreground` (o texto da
 * bolha enviada é `text-primary-foreground/70` sobre `bg-primary-foreground/10` sobre
 * `bg-primary`) e a trilha do slider (`--secondary` contra `--primary`). Alfa derruba a
 * razão: 70% de branco sobre azul médio dá 2,93:1, então a primária precisa ser extrema
 * em relação ao próprio foreground — escura no claro (texto branco), clara no escuro
 * (texto escuro).
 *
 * Limiares: 4,5:1 para TEXTO (1.4.3) e 3:1 para ícone/indicador de UI (1.4.11).
 *
 * Este arquivo roda em Node (`bun run test:contracts`), sem navegador: ele lê os
 * valores dos tokens dos fontes e faz a conta. A medição em navegador real (cascata,
 * `getComputedStyle`) vive em `e2e/contraste-aa.spec.ts`.
 */

// ─── Leitura dos tokens ─────────────────────────────────────────────────────

const lerArquivo = (caminho: string) => readFileSync(caminho, 'utf8');

/** Extrai os pares `--token: valor;` de um bloco CSS a partir do seu seletor. */
function tokensDoBloco(css: string, seletor: string): Record<string, string> {
  const inicio = css.indexOf(seletor);
  expect(inicio, `bloco ${seletor} não encontrado`).toBeGreaterThanOrEqual(0);
  const abre = css.indexOf('{', inicio);
  const fecha = css.indexOf('}', abre);
  const bloco = css.slice(abre + 1, fecha);
  const tokens: Record<string, string> = {};
  for (const linha of bloco.split('\n')) {
    const m = linha.match(/^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (m) tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

const TOKENS_CSS = lerArquivo('src/styles/tokens.css');
const ACCESSIBILITY_CSS = lerArquivo('src/styles/accessibility.css');

const BASE_CLARO = tokensDoBloco(TOKENS_CSS, ':root');
const BASE_ESCURO = { ...BASE_CLARO, ...tokensDoBloco(TOKENS_CSS, '.dark') };
const HC_CLARO = { ...BASE_CLARO, ...tokensDoBloco(ACCESSIBILITY_CSS, '.high-contrast') };
const HC_ESCURO = { ...BASE_ESCURO, ...tokensDoBloco(ACCESSIBILITY_CSS, '.dark.high-contrast') };

// ─── Cor: HSL → sRGB, composição alfa e razão WCAG ──────────────────────────

function hslToken(valor: string): [number, number, number] {
  const m = valor.trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  expect(m, `token não é HSL puro: ${valor}`).toBeTruthy();
  const [h, s, l] = [Number(m![1]) / 360, Number(m![2]) / 100, Number(m![3]) / 100];
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const linear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

const luminancia = (cor: number[]) =>
  0.2126 * linear(cor[0]) + 0.7152 * linear(cor[1]) + 0.0722 * linear(cor[2]);

function razao(a: number[], b: number[]): number {
  const [la, lb] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}

/** Compõe `cor` com `alfa` sobre `fundo` (sRGB, como o navegador faz). */
const sobre = (cor: number[], alfa: number, fundo: number[]) =>
  cor.map((c, i) => c * alfa + fundo[i] * (1 - alfa));

// ─── Tokens de um tema ──────────────────────────────────────────────────────

const PADRAO = 'corporate';

function paletaDoPreset(id: string, modo: 'light' | 'dark'): ThemeModeColors {
  const preset = THEME_PRESETS.find((p) => p.id === id);
  expect(preset, `preset ${id} não existe`).toBeTruthy();
  return preset![modo];
}

const t = (paleta: Record<string, string>, nome: string): number[] => hslToken(paleta[nome]);

// ─── Pares (o que os componentes realmente compõem) ─────────────────────────

const LIMIAR_TEXTO = 4.5;
const LIMIAR_UI = 3.0;

interface Par {
  rotulo: string;
  fg: number[];
  bg: number[];
  limiar: number;
  classe: string;
}

/** Pares que dependem da primária/secundária — o mesmo desenho nos 4 estados. */
function pares(paleta: Record<string, string>): Par[] {
  const bolha = sobre(t(paleta, 'primary-foreground'), 0.1, t(paleta, 'primary'));   // bg-primary-foreground/10
  const pastilha = sobre(t(paleta, 'primary-foreground'), 0.2, bolha);               // bg-primary-foreground/20
  const sidebarBg = sobre(t(paleta, 'muted'), 0.5, t(paleta, 'sidebar-background')); // bg-muted/50 no sidebar
  const recebida = sobre(t(paleta, 'muted'), 0.5, t(paleta, 'muted'));               // bg-muted/50 no balão
  return [
    { rotulo: 'balão enviado — texto (duração)', fg: sobre(t(paleta, 'primary-foreground'), 0.7, bolha), bg: bolha, limiar: LIMIAR_TEXTO, classe: 'text-primary-foreground/70 sobre bg-primary-foreground/10+bg-primary' },
    { rotulo: 'balão enviado — ícone 50%', fg: sobre(t(paleta, 'primary-foreground'), 0.5, bolha), bg: bolha, limiar: LIMIAR_UI, classe: 'text-primary-foreground/50' },
    { rotulo: 'balão enviado — botão play', fg: t(paleta, 'primary-foreground'), bg: pastilha, limiar: LIMIAR_TEXTO, classe: 'text-primary-foreground sobre bg-primary-foreground/20' },
    { rotulo: 'balão recebido — texto (duração)', fg: t(paleta, 'muted-foreground'), bg: recebida, limiar: LIMIAR_TEXTO, classe: 'text-muted-foreground sobre bg-muted/50+bg-muted' },
    { rotulo: 'overlay tela cheia — texto', fg: t(paleta, 'secondary-foreground'), bg: t(paleta, 'secondary'), limiar: LIMIAR_TEXTO, classe: 'bg-secondary text-secondary-foreground' },
    { rotulo: 'sidebar — ícone ativo', fg: t(paleta, 'primary'), bg: sidebarBg, limiar: LIMIAR_UI, classe: 'text-primary sobre bg-muted/50+bg-sidebar' },
    { rotulo: 'sidebar — ícone mudo', fg: t(paleta, 'muted-foreground'), bg: sidebarBg, limiar: LIMIAR_UI, classe: 'text-muted-foreground sobre bg-muted/50+bg-sidebar' },
    { rotulo: 'slider — range x trilha', fg: t(paleta, 'primary'), bg: t(paleta, 'secondary'), limiar: LIMIAR_UI, classe: 'bg-primary x bg-secondary' },
    { rotulo: 'popover — título', fg: t(paleta, 'muted-foreground'), bg: t(paleta, 'popover'), limiar: LIMIAR_TEXTO, classe: 'text-muted-foreground sobre bg-popover' },
    { rotulo: 'popover — percentual', fg: t(paleta, 'popover-foreground'), bg: t(paleta, 'popover'), limiar: LIMIAR_TEXTO, classe: 'text-popover-foreground sobre bg-popover' },
    { rotulo: 'botão default (Mudo)', fg: t(paleta, 'primary-foreground'), bg: t(paleta, 'primary'), limiar: LIMIAR_TEXTO, classe: 'bg-primary text-primary-foreground' },
    { rotulo: 'logo Z da sidebar', fg: t(paleta, 'primary-foreground'), bg: t(paleta, 'primary'), limiar: LIMIAR_TEXTO, classe: 'bg-primary text-primary-foreground' },
    // Corrigidos nesta tarefa (medições do axe na inbox e no aviso de conexão):
    { rotulo: 'avatar — iniciais', fg: t(paleta, 'primary'), bg: sobre(t(paleta, 'primary'), 0.15, t(paleta, 'card')), limiar: LIMIAR_TEXTO, classe: 'text-primary sobre bg-primary/15 + bg-card' },
    { rotulo: 'atalho de teclado', fg: t(paleta, 'muted-foreground'), bg: t(paleta, 'muted'), limiar: LIMIAR_TEXTO, classe: 'kbd bg-muted text-muted-foreground' },
    { rotulo: 'chip de status ativo', fg: t(paleta, 'foreground'), bg: t(paleta, 'accent'), limiar: LIMIAR_TEXTO, classe: 'bg-accent text-foreground' },
    { rotulo: 'aviso destrutivo — texto', fg: t(paleta, 'destructive-foreground'), bg: t(paleta, 'destructive'), limiar: LIMIAR_TEXTO, classe: 'text-destructive-foreground sobre bg-destructive' },
    { rotulo: 'aviso destrutivo — botão (fg/20)', fg: t(paleta, 'destructive-foreground'), bg: sobre(t(paleta, 'destructive-foreground'), 0.2, t(paleta, 'destructive')), limiar: LIMIAR_TEXTO, classe: 'bg-destructive-foreground/20 sobre bg-destructive' },
  ];
}

const ESTADOS: Array<[string, Record<string, string>]> = [
  ['claro (preset padrão)', efetiva(PADRAO, 'light')],
  ['escuro (preset padrão)', efetiva(PADRAO, 'dark')],
  ['alto contraste', HC_CLARO],
  ['alto contraste + escuro', HC_ESCURO],
];

/**
 * O preset CRU reprova; o que vai para o `<html>` é a paleta depois do ajuste de
 * luminosidade do aplicador (`coresComContrasteAA`, chamado por `applyThemePreset`).
 */
function efetiva(id: string, modo: 'light' | 'dark'): Record<string, string> {
  // A cascata real: os tokens do CSS (tokens.css) + o que o preset grava inline por cima.
  const base = modo === 'light' ? BASE_CLARO : BASE_ESCURO;
  return { ...base, ...coresComContrasteAA(paletaDoPreset(id, modo) as unknown as Record<string, string>, modo) };
}

describe('contraste AA — cores de skin (achado do E18)', () => {
  for (const [nome, paleta] of ESTADOS) {
    describe(nome, () => {
      for (const par of pares(paleta)) {
        it(`${par.rotulo} ≥ ${par.limiar}:1  [${par.classe}]`, () => {
          const r = razao(par.fg, par.bg);
          expect(
            Number(r.toFixed(2)),
            `${par.rotulo} = ${r.toFixed(2)}:1 (mínimo ${par.limiar}:1). ` +
              `Há alfa no caminho; a cor da primária/secundária precisa ser extrema.`,
          ).toBeGreaterThanOrEqual(par.limiar);
        });
      }
    });
  }
});

describe('contraste AA — o aplicador é quem grava a paleta ajustada', () => {
  it('applyThemePreset passa a skin por coresComContrasteAA antes de escrever no <html>', () => {
    const fonte = lerArquivo('src/components/settings/theme/presets.ts');
    expect(fonte).toContain('coresComContrasteAA(');
    expect(fonte).toMatch(/const colors = coresComContrasteAA\(/);
  });
});

describe('contraste AA — TODAS as skins, nos dois modos', () => {
  // A skin `diversity` é um caso à parte: ela troca `bg-primary` e o slider por GRADIENTES
  // (src/styles/diversity-overrides.css), então a cor sólida do token não é o que se vê.
  const PULADAS = new Set(['diversity']);

  for (const preset of THEME_PRESETS.filter((p) => !PULADAS.has(p.id))) {
    for (const modo of ['light', 'dark'] as const) {
      it(`${preset.id}/${modo}`, () => {
        const piores = pares(efetiva(preset.id, modo))
          .map((par) => ({ ...par, r: razao(par.fg, par.bg) }))
          .filter((par) => par.r < par.limiar);
        expect(
          piores.map((p) => `${p.rotulo} = ${p.r.toFixed(2)}:1 (mín ${p.limiar})`),
          `${preset.id}/${modo} tem par reprovando depois do ajuste`,
        ).toEqual([]);
      });
    }
  }
});

describe('contraste AA — os alfas que este contrato assume estão nos componentes', () => {
  const pinos: Array<[string, string]> = [
    ['src/components/inbox/AudioMessagePlayer.tsx', 'text-primary-foreground/70'],
    ['src/components/inbox/AudioMessagePlayer.tsx', 'text-primary-foreground/50'],
    ['src/components/inbox/AudioMessagePlayer.tsx', 'bg-primary-foreground/10'],
    ['src/components/inbox/AudioMessagePlayer.tsx', 'bg-primary-foreground/20'],
    ['src/components/inbox/AudioMessagePlayer.tsx', 'text-muted-foreground'],
    ['src/components/inbox/MediaVolumeControl.tsx', "'text-primary'"],
    ['src/components/layout/Sidebar.tsx', 'bg-muted/50'],
    ['src/components/inbox/VideoFullscreen.tsx', 'variant="secondary"'],
    ['src/components/ui/button.tsx', 'bg-secondary text-secondary-foreground'],
    ['src/components/ui/button.tsx', 'bg-primary text-primary-foreground'],
    ['src/components/ui/slider.tsx', 'bg-secondary'],
  ];

  for (const [arquivo, alvo] of pinos) {
    it(`${arquivo} usa ${alvo}`, () => {
      expect(lerArquivo(arquivo)).toContain(alvo);
    });
  }
});
