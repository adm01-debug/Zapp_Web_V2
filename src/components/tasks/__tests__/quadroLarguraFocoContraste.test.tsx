/**
 * E16 (fusão Quadro→Tarefas) — Quadro em largura total: colunas, foco e contraste.
 *
 * Três provas, e o que cada uma NÃO prova:
 *
 *  1. LARGURA — "em 1440 as 5 colunas cabem sem rolagem horizontal; ≤1024 vira
 *     carrossel". O jsdom não calcula layout, então a prova é ARITMÉTICA sobre o que o
 *     componente REAL renderiza: o piso `min-w-[Npx]` das 5 colunas e o `gap` do
 *     trilho, contra o espaço disponível montado com os tokens REAIS (`--sidebar-w` e
 *     `--layout-gutter`, lidos de `tokens.css`) e a válvula de escape do trilho
 *     (`overflow-x-auto` + snap), que é o carrossel. NÃO é medição de navegador:
 *     nenhum projeto do Playwright cobre Tarefas e `e2e/` não é arquivo deste cartão.
 *  2. FOCO — nenhum controle focável do quadro pode nascer invisível (`opacity-0`)
 *     sem uma saída pelo teclado, e o card anuncia o próprio anel de foco.
 *  3. CONTRASTE — os pares que o card e o cabeçalho da coluna REALMENTE pintam, com o
 *     mesmo medidor WCAG de `movimentoEContraste` (HSL → sRGB → luminância relativa),
 *     nos 4 temas, resolvendo a classe do elemento renderizado (e o remap do módulo
 *     que existe em `utilities.css`).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { render, screen, cleanup } from '@testing-library/react';

// Harness do domínio ANTES dos módulos sob teste (registra os `vi.mock`).
import { makeTaskRow } from '@/test/mocks/tarefas';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** O `@hello-pangea/dnd` não roda no jsdom — mesmo motivo do mock de `taskComponents`. */
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => children,
  Droppable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

afterEach(() => cleanup());

// ─── CSS do app lido do disco (é dele que saem os tokens e as regras medidas) ───
const lerCss = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const tokensCss = lerCss('../../../styles/tokens.css');
const utilitiesCss = lerCss('../../../styles/utilities.css');
const acessibilidadeCss = lerCss('../../../styles/accessibility.css');
const baseCss = lerCss('../../../styles/base.css');

/** Variáveis de um bloco (`:root {` / `.dark {`) — mesmo leitor do `movimentoEContraste`. */
function variaveis(css: string, cabecalho: string): Record<string, string> {
  const idx = css.indexOf(cabecalho);
  if (idx === -1) return {};
  const abre = css.indexOf('{', idx);
  let profundidade = 1;
  let i = abre + 1;
  while (profundidade > 0 && i < css.length) {
    if (css[i] === '{') profundidade++;
    else if (css[i] === '}') profundidade--;
    i++;
  }
  const vars: Record<string, string> = {};
  const re = /--([a-z0-9-]+):\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css.slice(abre + 1, i - 1)))) vars[m[1]] = m[2].trim().replace(/\s+/g, ' ');
  return vars;
}

const claro = variaveis(tokensCss, ':root {');
const escuro = { ...claro, ...variaveis(tokensCss, '.dark {') };
/** Os 4 temas do design system: claro, escuro e cada um com alto contraste. */
const TEMAS = {
  claro,
  escuro,
  'claro+alto contraste': { ...claro, ...variaveis(acessibilidadeCss, '.high-contrast {') },
  'escuro+alto contraste': { ...escuro, ...variaveis(acessibilidadeCss, '.dark.high-contrast {') },
};

/** Valor em px de um token de medida (`--sidebar-w: 256px`, `--layout-gutter: 2.25rem`). */
function tokenPx(css: string, nome: string): number {
  const m = css.match(new RegExp(`--${nome}:\\s*([\\d.]+)(px|rem)`));
  if (!m) throw new Error(`token --${nome} não encontrado no CSS do app`);
  return m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16;
}

// ─── Medidor WCAG (HSL → sRGB → luminância relativa), igual ao de movimentoEContraste ───
type RGB = [number, number, number];
function parseHsl(s: string): RGB {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/)!;
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
}
function hslToRgb(h: number, s: number, l: number): RGB {
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
function luminancia([r, g, b]: RGB): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
/** Como o navegador pinta `cor` com alfa sobre `base`. */
const pintar = (cor: RGB, alfa: number, base: RGB): RGB => cor.map((v, i) => v * alfa + base[i] * (1 - alfa)) as RGB;
const razaoRgb = (a: RGB, b: RGB): number => {
  const l1 = luminancia(a), l2 = luminancia(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
/** Razão WCAG entre dois tokens HSL do tema. */
const razaoToken = (vars: Record<string, string>, cor: string, fundo: string): number => {
  const m = cor.match(/^--(.+)$/);
  if (m && !vars[m[1]]) throw new Error(`token ${cor} não existe no tema`);
  return razaoRgb(hslToRgb(...parseHsl(m ? vars[m[1]] : cor)), hslToRgb(...parseHsl(vars[fundo])));
};

// ─── Classes renderizadas → medida de layout do Tailwind ───
/** Escala do Tailwind de volta para px (`min-w-[200px]`, `min-w-5` = 20px). */
function escalaTailwind(token: string): number | null {
  const px = token.match(/^\[(\d+(?:\.\d+)?)px\]$/);
  if (px) return Number(px[1]);
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token) * 4;
  return null;
}
/** O piso que o flexbox NÃO consegue encolher: a MAIOR `min-w-*` aplicável (ignora a variante). */
function pisoDeLargura(className: string): number {
  let piso = 0;
  for (const cls of className.split(/\s+/)) {
    const m = cls.match(/(?:^|:)min-w-(.+)$/);
    if (!m) continue;
    const px = escalaTailwind(m[1]);
    if (px === null) throw new Error(`o teste não sabe converter a classe de largura: ${cls}`);
    piso = Math.max(piso, px);
  }
  return piso;
}
/** O vão entre as colunas, lido do próprio trilho (`gap-3` = 12px). */
function gapDe(className: string): number {
  const m = className.split(/\s+/).map(c => c.match(/^(?:[a-z]+:)?gap-(\d+|\[\d+px\])$/)).find(Boolean);
  if (!m) throw new Error(`o trilho não declara um \`gap\` que o teste saiba ler: ${className}`);
  return escalaTailwind(m[1])!;
}

// ─── Resolução da cor REAL do elemento (o `className` renderizado + o remap do módulo) ───
/**
 * O remap de `utilities.css`: dentro de `[data-testid="tasks-module"]`, `text-warning` e
 * `text-destructive` são pintados com o par de TEXTO. O teste confere que a regra existe
 * (caso do bloco abaixo) antes de resolver por ela.
 */
function corDeTexto(className: string): string | null {
  if (/\[hsl\(var\(--warning-text\)\)\]/.test(className)) return '--warning-text';
  if (/\[hsl\(var\(--destructive-text\)\)\]/.test(className)) return '--destructive-text';
  if (/(^|\s)text-muted-foreground(\s|$)/.test(className)) return '--muted-foreground';
  if (/(^|\s)text-warning(\s|$)/.test(className)) return '--warning-text';
  if (/(^|\s)text-destructive(\s|$)/.test(className)) return '--destructive-text';
  if (/(^|\s)text-foreground(\s|$)/.test(className)) return '--foreground';
  return null;
}
function fundoDe(className: string): string | null {
  if (/(^|\s)bg-card(\/|$|\s)/.test(className)) return 'card';
  return null;
}
/**
 * Sobe a árvore aplicando a mesma ideia da cascata: o próprio elemento vence o ancestral.
 * Lê `getAttribute('class')` porque o ícone é `<svg>`, cujo `className` é um objeto.
 */
function corEfetiva(el: Element, raiz: HTMLElement, ler: (c: string) => string | null): string | null {
  for (let n: Element | null = el; n && n !== raiz.parentElement; n = n.parentElement) {
    const achado = ler(n.getAttribute('class') ?? '');
    if (achado) return achado;
  }
  return null;
}

// ─── Harness da tela ───
const VAZIO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
};
const item = (over: Record<string, unknown> = {}) => makeTaskRow(over) as unknown as WorkItem;

function renderQuadro(
  byStatus: Partial<Record<WorkItemStatus, WorkItem[]>> = {},
  doingCount?: number,
) {
  return render(
    <TooltipProvider>
      {/* O remap de cor do módulo vale por este seletor — o quadro vive dentro dele. */}
      <div data-testid="tasks-module">
        <TasksBoardMode
          byStatus={{ ...VAZIO, ...byStatus }}
          isLoading={false}
          doingCount={doingCount}
          onMove={vi.fn()}
          onReorder={vi.fn()}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
          onCreate={vi.fn()}
          onOpenContact={vi.fn()}
        />
      </div>
    </TooltipProvider>,
  );
}

/**
 * O trilho das 5 colunas e as próprias colunas. A âncora é o `data-board-column` que a
 * `BoardColumn` expõe (o rótulo da primeira coluna está dentro dela); o trilho é o pai.
 */
function trilhoEcolunas() {
  const primeira = screen.getByText('Caixa de entrada').closest<HTMLElement>('[data-board-column]');
  const trilho = primeira?.parentElement ?? null;
  if (!trilho) throw new Error('o trilho das colunas não foi encontrado');
  return { trilho, colunas: Array.from(trilho.querySelectorAll<HTMLElement>('[data-board-column]')) };
}

describe('E16 — as 5 colunas cabem na largura total (1440) e viram carrossel abaixo', () => {
  it('o piso das colunas + os vãos cabem em 1440 (sidebar aberta) e não cabem em 1024', () => {
    renderQuadro({ todo: [item()] });
    const { trilho, colunas } = trilhoEcolunas();
    expect(colunas).toHaveLength(5);

    const gap = gapDe(trilho.className);
    const pisos = colunas.map(c => pisoDeLargura(c.className));
    expect(new Set(pisos).size, `as 5 colunas têm pisos diferentes: ${pisos.join('/')}`).toBe(1);
    const piso = pisos[0] * colunas.length + gap * (colunas.length - 1);

    const sidebar = tokenPx(tokensCss, 'sidebar-w');
    const gutter = tokenPx(tokensCss, 'layout-gutter');

    // 1440 com a sidebar aberta: no pior caso com gutter dos DOIS lados do conteúdo…
    const guttersLaterais = gutter * 2;
    const totalComGutters = sidebar + guttersLaterais + piso;
    expect(totalComGutters).toBe(1376);
    expect(
      totalComGutters,
      `em 1440 com sidebar (${sidebar}px) + 2×gutter (${guttersLaterais}px), as 5 colunas pedem ${piso}px = ${totalComGutters}px`,
    ).toBeLessThanOrEqual(1440);
    // …e, depois da E05/E14 (`layout:'full'`, sem gutter), sobra ainda mais espaço.
    expect(sidebar + piso, `em 1440 com sidebar: ${sidebar + piso}px`).toBeLessThanOrEqual(1440);
    // Abaixo de 1024 o piso não cabe — é exatamente por isso que o trilho precisa rolar.
    expect(sidebar + piso, 'o carrossel de ≤1024 depende de o piso não caber').toBeGreaterThan(1024);
  });

  it('o trilho rola como carrossel e as colunas crescem juntas até preenchê-lo', () => {
    renderQuadro({ todo: [item()] });
    const { trilho, colunas } = trilhoEcolunas();

    // O trilho é a válvula de escape: é ele que rola (com snap) quando o piso não cabe.
    expect(trilho.className).toMatch(/(^|\s)overflow-x-auto(\s|$)/);
    expect(trilho.className).toMatch(/(^|\s)snap-x(\s|$)/);
    expect(trilho.className).toMatch(/(^|\s)min-w-0(\s|$)/);

    // Nenhuma coluna fixa a largura: todas crescem juntas até preencher o trilho.
    for (const [i, coluna] of colunas.entries()) {
      expect(coluna.className, `coluna ${i} precisa ser flexível`).toMatch(/(^|\s)(flex-1|grow)(\s|$)/);
      expect(coluna.className, `coluna ${i} não pode fixar a largura`).not.toMatch(/(^|\s)shrink-0(\s|$)/);
    }
  });
});

describe('E16 — foco visível no quadro', () => {
  it('nenhum controle focável nasce invisível sem saída pelo teclado', () => {
    const { container } = renderQuadro({
      todo: [item({ id: 't1', contact: { id: 'c1', name: 'Fulana' } })],
    });

    const focaveis = Array.from(
      container.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]'),
    );
    const nascemOcultos = focaveis.filter(el => /(^|\s)opacity-0(\s|$)/.test(el.className));
    // O quadro TEM controles que só aparecem no hover — senão o caso seria vazio e não provaria nada.
    expect(nascemOcultos.length).toBeGreaterThan(0);

    for (const el of nascemOcultos) {
      const nome = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName;
      expect(el.className, `${nome}: nasce com opacity-0 e o Tab para num controle que ninguém vê`)
        .toMatch(/focus-visible:opacity-100/);
    }
  });

  it('o card recebe o foco e anuncia o próprio anel; os botões ficam com a regra global', () => {
    const { container } = renderQuadro({ todo: [item()] });
    const card = container.querySelector<HTMLElement>('[data-testid="work-item-card"]')!;

    card.focus();
    expect(document.activeElement).toBe(card);
    expect(card.className).toMatch(/focus-visible:ring-2/);
    expect(card.className).toMatch(/focus-visible:ring-offset-2/);

    // Quem não declara anel próprio (as setas/dots e o botão da política) depende desta
    // regra global — se ela sumir, o foco dos botões fica invisível em silêncio.
    const base = baseCss.replace(/\s+/g, ' ');
    expect(base).toMatch(/button:focus-visible,[^}]*box-shadow:/);
  });
});

describe('E16 — contraste do card e das colunas', () => {
  const MIN_TEXTO = 4.5;
  /** 3:1 é o mínimo de WCAG 1.4.11 para ícone/componente de interface. */
  const MIN_ICONE = 3;

  it('o remap de cor do módulo (usado na medição abaixo) continua no CSS', () => {
    const css = utilitiesCss.replace(/\s+/g, ' ');
    expect(css).toMatch(/\[data-testid="tasks-module"\] \.text-warning,/);
    expect(css).toMatch(/\[data-testid="tasks-module"\] \.text-destructive \{/);
  });

  it('título e motivo de espera do card ≥ 4,5:1; ícone do kebab ≥ 3:1 (4 temas)', () => {
    const { container } = renderQuadro({
      waiting: [item({ id: 'w1', status: 'waiting', waiting_reason: 'Cliente responde' })],
    });
    const raiz = container.querySelector<HTMLElement>('[data-testid="tasks-module"]')!;
    const card = container.querySelector<HTMLElement>('[data-testid="work-item-card"]')!;
    const fundo = corEfetiva(card, raiz, fundoDe)!;
    expect(fundo).toBe('card');

    const alvos: Array<[string, Element, number]> = [
      ['título do card', screen.getByText('Ligar para o cliente'), MIN_TEXTO],
      ['motivo de espera', screen.getByText('Cliente responde'), MIN_TEXTO],
      // Escopado ao card: o QuickAdd do Backlog tem um botão com o MESMO aria-label.
      ['ícone do kebab', container.querySelector<SVGElement>('[data-testid="work-item-card"] button[aria-label="Mais opções"] svg')!, MIN_ICONE],
    ];

    for (const [nome, el, minimo] of alvos) {
      const cor = corEfetiva(el, raiz, corDeTexto);
      expect(cor, `${nome}: sem cor de texto resolvida`).toBeTruthy();
      for (const [tema, vars] of Object.entries(TEMAS)) {
        expect(razaoToken(vars, cor!, fundo), `${nome} — ${tema}`).toBeGreaterThanOrEqual(minimo);
      }
    }
  });

  it('o cabeçalho da coluna fecha 4,5:1 nos três estados (normal, acima do soft, cheio)', () => {
    const casos: Array<[string, Partial<Record<WorkItemStatus, WorkItem[]>>, number?]> = [
      ['normal', { todo: [item()] }],
      // `waiting` tem soft 5: o 6º item pinta o cabeçalho de warning.
      ['acima do soft', { waiting: Array.from({ length: 6 }, (_, i) => item({ id: `w${i}`, status: 'waiting' })) }],
      // `doing` tem hard 3 e a contagem vem de fora (é ela que vale para a trava de WIP).
      ['cheio', { doing: Array.from({ length: 3 }, (_, i) => item({ id: `d${i}`, status: 'doing' })) }, 3],
    ];

    for (const [estado, byStatus, doingCount] of casos) {
      cleanup();
      const { container } = renderQuadro(byStatus, doingCount);
      const raiz = container.querySelector<HTMLElement>('[data-testid="tasks-module"]')!;
      const { colunas } = trilhoEcolunas();
      for (const [i, coluna] of colunas.entries()) {
        const rotulo = coluna.querySelector<HTMLElement>('span')!;
        const cor = corEfetiva(rotulo, raiz, corDeTexto);
        const fundo = corEfetiva(rotulo, raiz, fundoDe);
        expect(cor, `coluna ${i} (${estado}): sem cor resolvida`).toBeTruthy();
        expect(fundo, `coluna ${i} (${estado}): sem fundo resolvido`).toBe('card');
        for (const [tema, vars] of Object.entries(TEMAS)) {
          expect(razaoToken(vars, cor!, fundo!), `cabeçalho coluna ${i} (${estado}) — ${tema}`)
            .toBeGreaterThanOrEqual(MIN_TEXTO);
        }
      }
    }
  });

  /**
   * MEDIDA REGISTRADA (não é uma aprovação): o card concluído é o único par do
   * `WorkItemCard` abaixo de AA, porque o desenho documentado usa `opacity-60` no card
   * INTEIRO (docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md:161 e :384, "concluída =
   * `opacity-60 line-through` no título"). Trocar desenho documentado é decisão de fora
   * deste cartão — está registrado no Kanban. Se o desenho mudar, este caso falha de
   * propósito para a medida ser reconferida.
   */
  it('card concluído: a medida registrada do desenho documentado (opacity-60)', () => {
    const medido: Record<string, number> = {};
    for (const [tema, vars] of Object.entries(TEMAS)) {
      const fundoPagina = hslToRgb(...parseHsl(vars.background));
      const fundoCard = pintar(hslToRgb(...parseHsl(vars.card)), 0.6, fundoPagina);
      // `opacity-60` é do card inteiro: texto e fundo são compostos separadamente
      // sobre a página, não texto sobre o fundo do card já composto.
      const texto = pintar(hslToRgb(...parseHsl(vars['muted-foreground'])), 0.6, fundoPagina);
      medido[tema] = Number(razaoRgb(texto, fundoCard).toFixed(2));
    }
    // Números medidos em 07/10/2026 para o `opacity-60` do plano. Se o desenho do card
    // concluído mudar, esta tabela falha de propósito: a medida precisa ser refeita.
    expect(medido).toEqual({
      'claro': 2.62,
      'escuro': 4.08,
      'claro+alto contraste': 3.71,
      'escuro+alto contraste': 4.70,
    });
    // No tema claro (o de referência) o desenho documentado fica fora do AA de texto.
    expect(medido.claro).toBeLessThan(MIN_TEXTO);
  });
});
