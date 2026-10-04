/**
 * Contraste WCAG-AA dos achados que NÃO dependem da skin escolhida pelo usuário.
 *
 * Contexto: o ajuste automático de luminosidade da skin (PR #1435) foi revertido no PR
 * #1458 por decisão explícita do dono do produto — a cor da skin aprovada vale mais que o
 * AA daqueles 6 pares. Este contrato cobre só o que se corrige SEM tocar em cor de tema:
 * alfa em texto secundário, cor hardcoded em botão e opacidade sobre aviso.
 *
 * Falha antes da correção (o "antes" medido em Chromium real pelo axe-core 4.13):
 *   - `text-muted-foreground/60` sobre branco ....... 2,36:1 (limiar 4,5)
 *   - `bg-amber-600 text-white` (Ativar 2FA) ....... 3,18:1 (limiar 4,5)
 *   - `opacity-80` no subtítulo do aviso ........... 2,89:1 (limiar 4,5)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LIMIAR_TEXTO = 4.5;

type Rgb = [number, number, number];

/** Luminância relativa (WCAG 2.1, sRGB). */
function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  const [alto, baixo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (baixo + 0.05);
}

/** HSL (formato dos tokens: `--x: 221 83% 53%`) → RGB. */
function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

/** Remove comentários CSS — menção a `.dark`/`:root` em comentário quebrava a extração. */
function semComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extrai os tokens de TODOS os blocos cujo seletor é `seletor` (ex.: `:root`, `.dark`),
 * com chaves balanceadas. Um `indexOf` simples falhava em dois cenários reais: menção ao
 * seletor dentro de comentário e arquivo com mais de um bloco do mesmo seletor.
 */
function tokensDoBloco(css: string, seletor: string): Record<string, Rgb> {
  const limpo = semComentarios(css);
  const tokens: Record<string, Rgb> = {};
  let pos = 0;
  for (;;) {
    const i = limpo.indexOf(seletor, pos);
    if (i < 0) break;
    pos = i + seletor.length;
    const resto = limpo.slice(pos, pos + 80);
    const abreRel = resto.indexOf('{');
    if (abreRel < 0) continue;
    // entre o seletor e a chave só pode haver espaço/vírgula — assim `.dark` citado em
    // texto solto ou usado como descendente (`.dark .x {`) não é confundido com o bloco.
    const entre = resto.slice(0, abreRel);
    if (/[^\s,]/.test(entre)) continue;
    const abre = pos + abreRel;
    let nivel = 0;
    for (let j = abre; j < limpo.length; j++) {
      if (limpo[j] === '{') nivel += 1;
      else if (limpo[j] === '}') {
        nivel -= 1;
        if (nivel === 0) {
          const corpo = limpo.slice(abre + 1, j);
          for (const t of Array.from(
            corpo.matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g),
          )) {
            tokens[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
          }
          break;
        }
      }
    }
  }
  return tokens;
}

const TOKENS_CSS = readFileSync('src/styles/tokens.css', 'utf8');
const CLARO = tokensDoBloco(TOKENS_CSS, ':root');
const ESCURO = tokensDoBloco(TOKENS_CSS, '.dark');

function parede(tokens: Record<string, Rgb>, nome: string): Rgb {
  const cor = tokens[nome];
  if (!cor) throw new Error(`token --${nome} ausente em tokens.css`);
  return cor;
}

/** Lista recursiva de arquivos por extensão. */
function listar(dir: string, ext: string): string[] {
  const saida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const caminho = `${dir}/${e.name}`;
    if (e.isDirectory()) saida.push(...listar(caminho, ext));
    else if (e.name.endsWith(ext)) saida.push(caminho);
  }
  return saida;
}

const FONTES = ['tsx', 'ts', 'css'].flatMap((ext) => listar('src', ext));

describe('contraste AA — o parser de tokens não pode quebrar por causa do arquivo', () => {
  it('acha o token no SEGUNDO bloco :root (tokens.css com 2 blocos)', () => {
    const css = `:root { --radius-md: 0.5rem; }
:root { --warning: 38 92% 50%; --warning-foreground: 30 90% 12%; }`;
    expect(tokensDoBloco(css, ':root')['warning-foreground']).toBeDefined();
    expect(tokensDoBloco(css, ':root')['warning']).toBeDefined();
  });

  it('ignora menção ao seletor dentro de comentário', () => {
    const css = `/* o tema escuro fica em \`.dark\` logo abaixo */
.dark { --warning-foreground: 0 0% 8%; }`;
    expect(tokensDoBloco(css, '.dark')['warning-foreground']).toEqual([20, 20, 20]);
  });

  it('não se perde com chave aninhada dentro do bloco', () => {
    const css = `:root { --a: 0 0% 0%; }
@media (min-width: 1px) { :root { --b: 100 50% 50%; } }`;
    const t = tokensDoBloco(css, ':root');
    expect(t.a).toBeDefined();
    expect(t.b).toBeDefined();
  });

  it('o tokens.css real entrega os tokens dos dois temas', () => {
    const claro = tokensDoBloco(TOKENS_CSS, ':root');
    const escuro = tokensDoBloco(TOKENS_CSS, '.dark');
    expect(claro['warning-foreground']).toBeDefined();
    expect(escuro['warning-foreground']).toBeDefined();
    expect(escuro['muted-foreground']).toBeDefined();
  });
});

describe('contraste AA — tokens que o axe reprovou (sem tocar na skin)', () => {
  it('texto do aviso de 2FA sobre --warning fecha 4,5:1 nos dois temas', () => {
    expect(razao(parede(CLARO, 'warning-foreground'), parede(CLARO, 'warning'))).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
    expect(razao(parede(ESCURO, 'warning-foreground'), parede(ESCURO, 'warning'))).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
  });

  it('texto secundário (sem alfa) fecha 4,5:1 sobre o fundo e sobre o card', () => {
    for (const [nome, tokens] of [
      ['claro', CLARO],
      ['escuro', ESCURO],
    ] as const) {
      for (const fundo of ['background', 'card', 'popover']) {
        expect(
          razao(parede(tokens, 'muted-foreground'), parede(tokens, fundo)),
          `${nome}: muted-foreground sobre ${fundo}`,
        ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
      }
    }
  });

  it('texto do aviso destrutivo é branco puro (o subtítulo não aplica opacidade)', () => {
    for (const [nome, tokens] of [
      ['claro', CLARO],
      ['escuro', ESCURO],
    ] as const) {
      expect(parede(tokens, 'destructive-foreground'), `${nome}: aviso deve usar texto claro`).toEqual([255, 255, 255]);
    }
    // O par --destructive-foreground sobre --destructive ainda fica abaixo de 4,5:1 nesta paleta
    // (3,78:1 no claro, 3,00:1 no escuro). Fechar isso exige escurecer --destructive, mudança global
    // de cor vetada pelo dono do produto (PR #1458) — fica registrado como pendência, não como AA.
  });

  it('nenhum texto secundário usa alfa /60 (dava 2,36:1 sobre branco)', () => {
    const achados = FONTES.filter((f) => readFileSync(f, 'utf8').includes('text-muted-foreground/60'));
    expect(achados, 'alfa sobre texto secundário derruba a razão abaixo de 4,5:1').toEqual([]);
  });

  it('nenhum botão usa amarelo hardcoded com texto branco (dava 3,18:1)', () => {
    const achados = FONTES.filter((f) => /bg-amber-[5-7]00[^\n]*text-white/.test(readFileSync(f, 'utf8')));
    expect(achados, 'use o token --warning, que já fecha AA nos dois temas').toEqual([]);
  });

  it('o aviso de conexão não aplica opacidade no próprio texto', () => {
    const banner = readFileSync('src/components/alerts/EvolutionDisconnectBanner.tsx', 'utf8');
    expect(banner).not.toMatch(/text-xs opacity-\d+ hidden sm:inline/);
  });
});

/**
 * E62 — contraste do combobox de endereços (SuggestionList.tsx) nos temas do produto.
 *
 * Pares que o componente realmente pinta (os mesmos de scripts/qa/contraste-combobox.mjs):
 *  - texto secundário: `--muted-foreground` sobre `--popover` (a lista é `bg-popover`);
 *  - `<mark>`: `HighlightedText.tsx` destaca com `bg-[hsl(var(--warning)/0.35)]` no claro e
 *    `/0.25` quando há `.dark`, e o texto é `text-inherit` — na linha do nome herda
 *    `--foreground`, na do endereço herda `--muted-foreground`.
 *
 * Reusa o medidor WCAG já presente neste arquivo (`razao`/`hslParaRgb`) e lê o alto contraste
 * de `accessibility.css`. Um caso por tema; o CI pega a próxima regressão de token.
 */
const A11Y_CSS = readFileSync('src/styles/accessibility.css', 'utf8');

/** Corpo de um bloco por cabeçalho EXATO (`seletor {`) — evita que `.high-contrast` case
 *  também com `.dark.high-contrast` (substring) e sobrescreva o tema claro. */
function tokensDoBlocoExato(css: string, cabecalho: string): Record<string, Rgb> {
  const limpo = semComentarios(css);
  const alvo = `${cabecalho} {`;
  const i = limpo.indexOf(alvo);
  if (i < 0) throw new Error(`bloco ${cabecalho} ausente em accessibility.css`);
  const abre = i + alvo.length - 1;
  let nivel = 0;
  for (let j = abre; j < limpo.length; j++) {
    if (limpo[j] === '{') nivel += 1;
    else if (limpo[j] === '}') {
      nivel -= 1;
      if (nivel === 0) {
        const out: Record<string, Rgb> = {};
        for (const t of Array.from(
          limpo
            .slice(abre + 1, j)
            .matchAll(/--([\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g),
        )) {
          out[t[1]] = hslParaRgb(Number(t[2]), Number(t[3]), Number(t[4]));
        }
        return out;
      }
    }
  }
  throw new Error(`bloco ${cabecalho} sem fechamento em accessibility.css`);
}

/** `cor` com alfa composta sobre `base` (como o navegador pinta o destaque do `<mark>`). */
function compor(cor: Rgb, alfa: number, base: Rgb): Rgb {
  return [0, 1, 2].map((i) => cor[i] * alfa + base[i] * (1 - alfa)) as Rgb;
}

describe('E62 — contraste do combobox de endereços nos temas', () => {
  // `.dark.high-contrast` vence `.high-contrast` (mais específico e depois no arquivo).
  const HC_CLARO: Record<string, Rgb> = { ...CLARO, ...tokensDoBlocoExato(A11Y_CSS, '.high-contrast') };
  const HC_ESCURO: Record<string, Rgb> = {
    ...ESCURO,
    ...tokensDoBlocoExato(A11Y_CSS, '.high-contrast'),
    ...tokensDoBlocoExato(A11Y_CSS, '.dark.high-contrast'),
  };

  const TEMAS: Array<[string, Record<string, Rgb>, number]> = [
    ['claro', CLARO, 0.35],
    ['escuro', ESCURO, 0.25],
    ['alto contraste', HC_CLARO, 0.35],
    ['alto contraste escuro', HC_ESCURO, 0.25],
  ];

  for (const [nome, tokens, alpha] of TEMAS) {
    it(`${nome}: texto secundário e <mark> fecham 4,5:1 sobre o popover da lista`, () => {
      const popover = parede(tokens, 'popover');
      // Linha secundária (endereço/distância/rodapé).
      expect(
        razao(parede(tokens, 'muted-foreground'), popover),
        `${nome}: muted-foreground sobre popover`,
      ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);

      // `<mark>` da busca composto sobre o popover.
      const destaque = compor(parede(tokens, 'warning'), alpha, popover);
      expect(
        razao(parede(tokens, 'foreground'), destaque),
        `${nome}: mark da linha do nome (foreground)`,
      ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
      expect(
        razao(parede(tokens, 'muted-foreground'), destaque),
        `${nome}: mark da linha do endereço (muted-foreground)`,
      ).toBeGreaterThanOrEqual(LIMIAR_TEXTO);
    });
  }

  it('a fonte do componente ainda casa com os pares medidos (bg-popover + <mark> warning com alfa)', () => {
    const lista = readFileSync('src/components/inbox/location-picker/SuggestionList.tsx', 'utf8');
    expect(lista).toMatch(/bg-popover/);
    expect(lista).toContain('HighlightedText');

    const destaque = readFileSync('src/components/inbox/chat/HighlightedText.tsx', 'utf8');
    expect(destaque).toMatch(/<mark/);
    expect(destaque).toMatch(/bg-\[hsl\(var\(--warning\)\/0\.35\)\]/);
    expect(destaque).toMatch(/dark:bg-\[hsl\(var\(--warning\)\/0\.25\)\]/);
  });
});
