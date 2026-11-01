/**
 * N-029 â€” os selos de SLA do Inbox ('no prazo', 'atenÃ§Ã£o' e 'violado') fecham contraste AA.
 *
 * O defeito (auditorias de 07/10/2026 â€” `A11Y-CHAT_INBOX_TEAMS-04` e `A11Y-CONTATOS_CRM-05`):
 * o `statusStyles` do `SLAIndicator` pintava o TEXTO do selo com a cor de PREENCHIMENTO do
 * estado â€” `text-warning` (Ã¢mbar L50) e `text-destructive` (vermelho L60) â€” sobre a prÃ³pria
 * tinta (`bg-warning/10`, `bg-destructive/10`). O axe flagrou o selo
 * `[aria-label="SLA violado"]` em 2,53:1 (claro) e 3,38:1 (escuro).
 *
 * Como este teste prova: renderiza o `SLAIndicator` REAL (jsdom) nos 3 estados, lÃª a lista de
 * classes que o SELO realmente recebeu, resolve dela o token de fundo, o alfa da tinta e o
 * token de texto, compÃµe a tinta sobre o card (como o navegador pinta) e mede a razÃ£o WCAG
 * contra `src/styles/tokens.css` + `src/styles/accessibility.css` nos 4 temas. Nada de
 * literal de classe pinado: se a classe do componente mudar, a razÃ£o medida muda com ela.
 *
 * O que este teste NÃƒO prova: cor em pixel â€” o jsdom nÃ£o carrega o CSS do app (a varredura do
 * axe no Chromium real Ã© da rÃ©gua TL-175D). A medida abaixo Ã© do par que a classe aplicada
 * resolve, com o mesmo medidor do repo (`tasks/__tests__/movimentoEContraste.test.tsx`).
 */
import { readFileSync } from 'node:fs';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SLAStatus } from '@/hooks/sla/useSLACalculation';
import { SLAIndicator } from '../SLAIndicator';

// â”€â”€â”€ WCAG 2.1: HSL (formato dos tokens) â†’ sRGB, composiÃ§Ã£o alfa e razÃ£o â”€â”€â”€â”€
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

/** A tinta `bg-<token>/<alfa>` sobre a superfÃ­cie, como o navegador pinta (sRGB, canal a canal). */
function sobreTinta(tinta: Rgb, alfa: number, base: Rgb): Rgb {
  return [0, 1, 2].map((i) => tinta[i] * alfa + base[i] * (1 - alfa)) as Rgb;
}

/**
 * Tokens de UM bloco por cabeÃ§alho EXATO (`:root {`, `.dark {`, â€¦) â€” um `indexOf` simples
 * deixaria `.high-contrast {` casar tambÃ©m com `.dark.high-contrast {` e o alto contraste
 * CLARO seria medido com os tokens do ESCURO. SÃ³ os valores em trinca HSL entram; o resto
 * (`clamp()`, sombras, raios) Ã© ignorado.
 */
function variaveisDoBloco(css: string, cabecalho: string): Record<string, Rgb> {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*!important/g, '');
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
            .matchAll(/--(\w[\w-]+):\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*;/g),
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

// â”€â”€â”€ ExtraÃ§Ã£o das classes REAIS aplicadas pelo selo renderizado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Tinta do selo: `bg-destructive/10` â†’ ['destructive', 0.1]. */
function tintaDaClasse(className: string): { token: string; alfa: number } {
  const m = className.match(/(?:^|\s)bg-([a-z][a-z0-9-]*)\/(\d+)(?:\s|$)/);
  if (!m) throw new Error(`selo sem tinta \`bg-<token>/<alfa>\`: "${className}"`);
  return { token: m[1], alfa: Number(m[2]) / 100 };
}

/** Token de TEXTO do selo: `text-success` ou `text-[hsl(var(--warning-text))]`. */
function textoDaClasse(className: string): string {
  const literal = className.match(/(?:^|\s)text-\[hsl\(var\(--(\w[\w-]+)\)\)\](?:\s|$)/);
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
 * primeira resposta: no estado `breached` ele Ã© o que leva ao selo grande da linha 149-156
 * (o mesmo trecho citado pelo cartÃ£o).
 */
const CASOS: Array<{ rotulo: string; status: SLAStatus; compact: boolean; props: PropsSLA }> = [
  {
    rotulo: 'no prazo (ok)',
    status: 'ok',
    compact: true,
    props: { firstMessageAt: new Date(Date.now() - 1 * MINUTO), firstResponseAt: null, firstResponseMinutes: 5 },
  },
  {
    rotulo: 'atenÃ§Ã£o (warning)',
    status: 'warning',
    compact: true,
    // Prazo de 5 min: com o limiar proporcional (30% restantes = 1,5 min),
    // 3 min decorridos ainda seria "no prazo"; 4 min deixa 1 min (20%) -> atenÃ§Ã£o.
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

/** Renderiza o selo REAL e devolve as classes que ele (e nÃ£o um mock) recebeu. */
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
    if (!painel) throw new Error(`${caso.rotulo}: o indicador nÃ£o renderizou (role="status")`);
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
  ok: 'success', // o verde jÃ¡ Ã© o prÃ³prio par de texto â€” nÃ£o existe `--success-text`
  warning: 'warning-text',
  breached: 'destructive-text',
};

const MIN_TEXTO = 4.5;

afterEach(() => cleanup());

describe('N-029 â€” os selos de SLA fecham AA com o par de texto do estado', () => {
  const selos = medirSelos();

  it('renderiza os 3 estados de selo (incluindo o do trecho 149-156)', () => {
    expect(new Set(selos.map((s) => s.status))).toEqual(new Set(['ok', 'warning', 'breached']));
    expect(selos.length).toBeGreaterThanOrEqual(CASOS.length);
  });

  it('o texto de cada selo Ã© o par de TEXTO do estado, nÃ£o a cor de preenchimento', () => {
    for (const selo of selos) {
      expect(
        selo.texto,
        `${selo.rotulo}: o texto do selo ("${selo.texto}") tem de ser o par de texto do estado`,
      ).toBe(TEXTO_DO_ESTADO[selo.status]);
    }
  });

  it('a tinta segue sendo o preenchimento do estado a 10% (o desenho do selo nÃ£o muda)', () => {
    const esperado: Record<SLAStatus, string> = { ok: 'success', warning: 'warning', breached: 'destructive' };
    for (const selo of selos) {
      expect(selo.tinta, `${selo.rotulo}: tinta do selo`).toBe(esperado[selo.status]);
      expect(selo.alfa, `${selo.rotulo}: alfa da tinta`).toBe(0.1);
    }
  });

  for (const [nome, tokens] of TEMAS) {
    it(`${nome}: cada selo fecha 4,5:1 sobre a prÃ³pria tinta composta no card`, () => {
      for (const selo of selos) {
        const texto = tokens[selo.texto];
        const tinta = tokens[selo.tinta];
        expect(texto, `${selo.rotulo}: --${selo.texto} nÃ£o estÃ¡ definido em ${nome}`).toBeDefined();
        expect(tinta, `${selo.rotulo}KIÜÙ[Ë[_H°èÛÈ\İ0èHYš[šYÈ[H	Û›ÛY_X
KĞ™QYš[™Y

NÂˆÛÛœİYYYÈH˜^˜[Ê^ËÛØœ™U[J[KÙ[Ë˜[˜KÚÙ[œË˜Ø\™
JNÂˆ^Xİ
ˆYYYËˆ	ÜÙ[Ëœ›İ[ßH8 %	Û›ÛY_Nˆ	ÜÙ[Ë^ßHÛØœ™H	ÜÙ[Ë[_KÉÜÙ[Ë˜[˜H
ˆLXˆ
KĞ™QÜ™X]\•[“Ü‘\]X[
RS—ÕVÊNÂˆBˆJNÂˆB‚ˆ]
	ØHYYYH™YÚ\İ˜YH0êHH™X[
]YHH›Ü0ìÜÚ]ÈÙH[HÚÙ[ˆ]Y\ŠIË

HOˆÂˆËÈÜ™[HÜÈ[X\ÎˆØÛ\›Ë\Øİ\›ËÛ\›ÊØ[ÈÛÛ˜\İK\Øİ\›ÊØ[ÈÛÛ˜\İWK‚ˆËÈ[\ÈHÛÜœ™péğèÛÈ
^ÈH™Y[˜Ú[Y[ÊNˆ][°éğèÛÈKNÈŒHš[ÛYÈËÌˆÈKŒK‚ˆÛÛœİYYYÈHÙ[ÜË›X\

Ù[ÊHOˆ
ÂˆÙ[ÎˆÙ[Ëœ›İ[Ëˆ˜^˜[ÎˆSPTË›X\

ËÚÙ[œ×JHO‚ˆ[X™\Š˜^˜[ÊÚÙ[œÖÜÙ[Ë^×KÛØœ™U[JÚÙ[œÖÜÙ[Ë[WKÙ[Ë˜[˜KÚÙ[œË˜Ø\™
JKÑš^Y
ŠJKˆ
KˆJJNÂ‚ˆ^Xİ
YYYÊKÑ\]X[
ÂˆÈÙ[Îˆ	Û›È˜^›È
ÚÊIË˜^˜[ÎˆÍL‹‹NKL‹ËHKˆÈÙ[Îˆ	Ø][°éğèÛÈ
Ø\›š[™ÊIË˜^˜[ÎˆÍKŒKŒ‹KŒKKŒÌ×HKˆÈÙ[Îˆ	İš[ÛYÈ
œ™XXÚYZ[™HÙ[H™\ÜÜİJIË˜^˜[ÎˆÍ‹Œ‹KŒÌ‹KË‹ŒL×HKˆÈÙ[Îˆ	İš[ÛYÈ
œ™XXÚYÛÛH™\ÜÜİH›Ü˜HÈ˜^›ÊIË˜^˜[ÎˆÍ‹Œ‹KŒÌ‹KË‹ŒL×HKˆJNÂˆJNÂŸJNÂ