/**
 * N-029 — os selos de SLA do Inbox ('no prazo', 'atenção' e 'violado') fecham contraste AA.
 *
 * O defeito (auditorias de 07/10/2026 — `A11Y-CHAT_INBOX_TEAMS-04` e `A11Y-CONTATOS_CRM-05`):
 * o `statusStyles` do `SLAIndicator` pintava o TEXTO do selo com a cor de PREENCHIMENTO do
 * estado — `text-warning` (âmbar L50) e `text-destructive` (vermelho L60) — sobre a própria
 * tinta (`bg-warning/10`, `bg-destructive/10`). O axe flagrou o selo
 * `[aria-label="SLA violado"]` em 2,53:1 (claro) e 3,38:1 (escuro).
 *
 * Como este teste prova: renderiza o `SLAIndicator` REAL (jsdom) nos 3 estados, lê a lista de
 * classes que o SELO realmente recebeu, resolve dela o token de fundo, o alfa da tinta e o
 * token de texto, compõe a tinta sobre o card (como o navegador pinta) e mede a razão WCAG
 * contra `src/styles/tokens.css` + `src/styles/accessibility.css` nos 4 temas. Nada de
 * literal de classe pinado: se a classe do componente mudar, a razão medida muda com ela.
 *
 * O que este teste NÃO prova: cor em pixel — o jsdom não carrega o CSS do app (a varredura do
 * axe no Chromium real é da régua TL-175D). A medida abaixo é do par que a classe aplicada
 * resolve, com o mesmo medidor do repo (`tasks/__tests__/movimentoEContraste.test.tsx`).
 */
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SLAStatus } from '@/hooks/sla/useSLACalculation';
import { SLAIndicator } from '../SLAIndicator';

// ─── WCAG 2.1: HSL (formato dos tokens) → sRGB, composição alfa e razão ────
type Rgb = [number, number, number];

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

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

/** A tinta `bg-<token>/<alfa>` sobre a superfície, como o navegador pinta (sRGB, canal a canal). */
function sobreTinta(tinta: Rgb, alfa: number, base: Rgb): Rgb {
  return [0, 1, 2].map((i) => tinta[i] * alfa + base[i] * (1 - alfa)) as Rgb;
}

/**
 * Tokens de UM bloco por cabeçalho EXATO (`:root {`, `.dark {`, …) — um `indexOf` simples
 * deixaria `.high-contrast {` casar também com `.dark.high-contrast {` e o alto contraste
 * CLARO seria medido com os tokens do ESCURO. Só os valores em trinca HSL entram; o resto
 * (`clamp()`, sombras, raios) é ignorado.
 */
function variaveisDoBloco(css: string, cabecalho: string): Record<string, Rgb> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const alvo = `${cabecalho} {`;
  const i = limpo.indexOf(alvo);
  if (i < 0) throw new Error(`bloco ${alvo} ausente no CSS`);
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
  throw new Error(`bloco ${alvo} sem fechamento`);
}

const TOKENS_CSS = readFileSync('src/styles/tokens.css', 'utf8');
const A11Y_CSS = readFileSync('src/styles/accessibility.css', 'utf8');

const CLARO = variaveisDoBloco(TOKENS_CSS, ':root');
const ESCURO = { ...CLARO, ...variaveisDoBloco(TOKENS_CSS, '.dark') };
const HC_CLARO = { ...CLARO, ...variaveisDoBloco(A11Y_CSS, '.high-contrast') };
const HC_ESCURO = { ...ESCURO, ...variaveisDoBloco(A11Y_CSS, '.dark.high-contrast') };

const TEMAS: Array<[string, Record<string, Rgb>]> = [
  ['claro', CLARO],
  ['escuro', ESCURO],
  ['claro+alto contraste', HC_CLARO],
  ['escuro+alto contraste', HC_ESCURO],
];

// ─── Extração das classes REAIS aplicadas pelo selo renderizado ─────────────

/** Tinta do selo: `bg-destructive/10` → ['destructive', 0.1]. */
function tintaDaClasse(className: string): { token: string; alfa: number } {
  const m = className.match(/(?:^|\s)bg-([a-z][a-z0-9-]*)\/(\d+)(?:\s|$)/);
  if (!m) throw new Error(`selo sem tinta \`bg-<token>/<alfa>\`: "${className}"`);
  return { token: m[1], alfa: Number(m[2]) / 100 };
}

/** Token de TEXTO do selo: `text-success` ou `text-[hsl(var(--warning-text))]`. */
function textoDaClasse(className: string): string {
  const literal = className.match(/(?:^|\s)text-\[hsl\(var\(--([\w-]+)\)\)\](?:\s|$)/);
  if (literal) return literal[1];
  for (const c of className.split(/\s+/)) {
    const m = c.match(/^text-([a-z][a-z0-9-]*)$/);
    if (m && CLARO[m[1]]) return m[1];
  }
  throw new Error(`selo sem token de texto do sistema: "${className}"`);
}

interface Selo {
  rotulo: string;
  status: SLAStatus;
  texto: string;
  tinta: string;
  alfa: number;
}

const MINUTO = 60_000;

/** Os props do selo (o mesmo contrato do componente), sem `any` no teste. */
interface PropsSLA {
  firstMessageAt: Date;
  firstResponseAt: Date | null;
  firstResponseMinutes: number;
}

/**
 * Os 4 selos que o componente renderiza para os 3 estados. O `firstResponseAt` fecha a
 * primeira resposta: no estado `breached` ele é o que leva ao selo grande da linha 149-156
 * (o mesmo trecho citado pelo cartão).
 */
const CASOS: Array<{ rotulo: string; status: SLAStatus; compact: boolean; props: PropsSLA }> = [
  {
    rotulo: 'no prazo (ok)',
    status: 'ok',
    compact: true,
    props: { firstMessageAt: new Date(Date.now() - 1 * MINUTO), firstResponseAt: null, firstResponseMinutes: 5 },
  },
  {
    rotulo: 'atenção (warning)',
    status: 'warning',
    compact: true,
    // Prazo de 5 min: com o limiar proporcional (30% restantes = 1,5 min),
    // 3 min decorridos ainda seria "no prazo"; 4 min deixa 1 min (20%) -> atenção.
    props: { firstMessageAt: new Date(Date.now() - 4 * MINUTO), firstResponseAt: null, firstResponseMinutes: 5 },
  },
  {
    rotulo: 'violado (breached, ainda sem resposta)',
    status: 'breached',
    compact: true,
    props: { firstMessageAt: new Date(Date.now() - 10 * MINUTO), firstResponseAt: null, firstResponseMinutes: 5 },
  },
  {
    rotulo: 'violado (breached, com resposta fora do prazo)',
    status: 'breached',
    compact: false,
    props: {
      firstMessageAt: new Date(Date.now() - 10 * MINUTO),
      firstResponseAt: new Date(Date.now() - 2 * MINUTO),
      firstResponseMinutes: 5,
    },
  },
];

/** Renderiza o selo REAL e devolve as classes que ele (e não um mock) recebeu. */
function medirSelos(): Selo[] {
  const selos: Selo[] = [];
  for (const caso of CASOS) {
    cleanup();
    const { container } = render(
      <SLAIndicator
        firstMessageAt={caso.props.firstMessageAt}
        firstResponseAt={caso.props.firstResponseAt}
        firstResponseMinutes={caso.props.firstResponseMinutes}
        compact={caso.compact}
      />,
    );
    const painel = container.querySelector('[role="status"]');
    if (!painel) throw new Error(`${caso.rotulo}: o indicador não renderizou (role="status")`);
    const alvos = container.querySelectorAll(
      '[class*="bg-success/"], [class*="bg-warning/"], [class*="bg-destructive/"]',
    );
    expect(alvos.length, `${caso.rotulo}: selo com tinta de estado`).toBeGreaterThan(0);
    alvos.forEach((el) => {
      const { token, alfa } = tintaDaClasse(el.className);
      selos.push({ rotulo: caso.rotulo, status: caso.status, texto: textoDaClasse(el.className), tinta: token, alfa });
    });
  }
  cleanup();
  return selos;
}

/** O par de TEXTO que o design system define para cada estado. */
const TEXTO_DO_ESTADO: Record<SLAStatus, string> = {
  ok: 'success', // o verde já é o próprio par de texto — não existe `--success-text`
  warning: 'warning-text',
  breached: 'destructive-text',
};

const MIN_TEXTO = 4.5;

afterEach(() => cleanup());

describe('N-029 — os selos de SLA fecham AA com o par de texto do estado', () => {
  const selos = medirSelos();

  it('renderiza os 3 estados de selo (incluindo o do trecho 149-156)', () => {
    expect(new Set(selos.map((s) => s.status))).toEqual(new Set(['ok', 'warning', 'breached']));
    expect(selos.length).toBeGreaterThanOrEqual(CASOS.length);
  });

  it('o texto de cada selo é o par de TEXTO do estado, não a cor de preenchimento', () => {
    for (const selo of selos) {
      expect(
        selo.texto,
        `${selo.rotulo}: o texto do selo ("${selo.texto}") tem de ser o par de texto do estado`,
      ).toBe(TEXTO_DO_ESTADO[selo.status]);
    }
  });

  it('a tinta segue sendo o preenchimento do estado a 10% (o desenho do selo não muda)', () => {
    const esperado: Record<SLAStatus, string> = { ok: 'success', warning: 'warning', breached: 'destructive' };
    for (const selo of selos) {
      expect(selo.tinta, `${selo.rotulo}: tinta do selo`).toBe(esperado[selo.status]);
      expect(selo.alfa, `${selo.rotulo}: alfa da tinta`).toBe(0.1);
    }
  });

  for (const [nome, tokens] of TEMAS) {
    it(`${nome}: cada selo fecha 4,5:1 sobre a própria tinta composta no card`, () => {
      for (const selo of selos) {
        const texto = tokens[selo.texto];
        const tinta = tokens[selo.tinta];
        expect(texto, `${selo.rotulo}: --${selo.texto} não está definido em ${nome}`).toBeDefined();
        expect(tinta, `${selo.rotulo}: --${selo.tinta} não está definido em ${nome}`).toBeDefined();
        const medido = razao(texto, sobreTinta(tinta, selo.alfa, tokens.card));
        expect(
          medido,
          `${selo.rotulo} — ${nome}: ${selo.texto} sobre ${selo.tinta}/${selo.alfa * 100}`,
        ).toBeGreaterThanOrEqual(MIN_TEXTO);
      }
    });
  }

  it('a medida registrada é a real (muda de propósito se um token mudar)', () => {
    // Ordem dos temas: [claro, escuro, claro+alto contraste, escuro+alto contraste].
    // Antes da correção (texto = preenchimento): atenção 1,98 / 8,20 e violado 3,32 / 5,21.
    const medido = selos.map((selo) => ({
      selo: selo.rotulo,
      razao: TEMAS.map(([, tokens]) =>
        Number(razao(tokens[selo.texto], sobreTinta(tokens[selo.tinta], selo.alfa, tokens.card)).toFixed(2)),
      ),
    }));

    expect(medido).toEqual([
      { selo: 'no prazo (ok)', razao: [4.92, 6.59, 4.92, 7.44] },
      { selo: 'atenção (warning)', razao: [5.01, 8.2, 5.01, 9.33] },
      { selo: 'violado (breached, ainda sem resposta)', razao: [6.02, 5.32, 5.7, 6.13] },
      { selo: 'violado (breached, com resposta fora do prazo)', razao: [6.02, 5.32, 5.7, 6.13] },
    ]);
  });
});
