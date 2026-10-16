/**
 * Etapa 099 — responsivo do Quadro: uma coluna por vez com abas no topo
 * (abaixo de 768 px) e as cinco colunas sem rolagem horizontal (a partir de
 * 1280 px).
 *
 * O que esta prova cobre, e por qual caminho REAL:
 *
 *  1. ESTRUTURA (`<768`) — o Quadro monta UMA coluna por vez e troca de coluna
 *     pelas abas; o conteúdo da coluna é o cartão de verdade (`WorkItemCard`),
 *     não um stub. Nenhum contêiner do quadro declara rolagem horizontal — é o
 *     teste que prova a ausência, porque o jsdom não calcula layout.
 *  2. ARITMÉTICA — o piso `min-w-*` das colunas é lido do `className`
 *     RENDERIZADO, por faixa (md e xl), contra o espaço disponível montado com
 *     os tokens REAIS (`--sidebar-w` e `--layout-gutter`, de `tokens.css`).
 *     Como o jsdom não mede, essa conta é a prova de "sem rolagem" nas faixas
 *     em que a grade distribui a largura. NÃO é medição de navegador: nenhum
 *     projeto do Playwright cobre Tarefas.
 *  3. TECLADO E SEMÂNTICA — as abas são `tablist`/`tab`/`tabpanel`, com um
 *     único ponto de tabulação (roving `tabIndex`) e setas/Home/End; a árvore
 *     passa no axe.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { makeTaskRow } from '@/test/mocks/tarefas';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** O `@hello-pangea/dnd` não roda no jsdom — mesmo mock da E16. */
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => children,
  Droppable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

afterEach(() => cleanup());

// ─── Ambiente de mídia (a mesma fonte do componente: pointerMedia/matchMedia) ───
/** Mente sobre as media queries do ambiente e devolve o desfazer. */
function fingirMidia(matches: (consulta: string) => boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((consulta: string) => ({
    matches: matches(consulta),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => { window.matchMedia = original; };
}

/** Abaixo de `md`: o corte de `useNarrowViewport` (§ pointerMedia.ts). */
const TELA_ESTREITA = (consulta: string) => consulta.includes('max-width: 767px');

// ─── Tokens reais (é deles que sai o espaço disponível) ───
const tokensCss = fs.readFileSync(
  path.resolve(__dirname, '../../../styles/tokens.css'),
  'utf8',
);
function tokenPx(nome: string): number {
  const m = tokensCss.match(new RegExp(`--${nome}:\\s*([\\d.]+)(px|rem)`));
  if (!m) throw new Error(`token --${nome} não encontrado no CSS do app`);
  return m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16;
}

/** Escala do Tailwind de volta para px (`min-w-[200px]`, `min-w-5` = 20px). */
function escalaTailwind(token: string): number | null {
  const px = token.match(/^\[(\d+(?:\.\d+)?)px\]$/);
  if (px) return Number(px[1]);
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token) * 4;
  return null;
}

/**
 * O piso de largura que a coluna impõe NAQUELA faixa — modelo do cascade do
 * Tailwind: a variante sem prefixo vale sempre e a de MAIOR ponto de quebra
 * (a última na folha de estilo) ganha das menores. Usar o "maior `min-w-*` do
 * `className`" mentiria: em `xl` o `min-w-0` do `xl` vence o `md:min-w-[200px]`.
 */
const PONTOS_DE_QUEBRA = ['', 'sm', 'md', 'lg', 'xl'] as const;
function pisoNaFaixa(className: string, faixa: 'md' | 'xl'): number {
  const limite = PONTOS_DE_QUEBRA.indexOf(faixa);
  let piso = 0;
  let vencedor = -1;
  for (const cls of className.split(/\s+/)) {
    const m = cls.match(/^((?:[a-z]+:)*)min-w-(.+)$/);
    if (!m) continue;
    const prefixo = m[1].replace(/:$/, '');
    const ponto = PONTOS_DE_QUEBRA.indexOf(prefixo as typeof PONTOS_DE_QUEBRA[number]);
    if (ponto === -1 || ponto > limite) continue; // variante que ainda não vale
    const px = escalaTailwind(m[2]);
    if (px === null) throw new Error(`o teste não sabe converter a classe de largura: ${cls}`);
    if (ponto >= vencedor) { vencedor = ponto; piso = px; }
  }
  return piso;
}

/** O vão entre as colunas, lido do próprio trilho (`gap-3` = 12px). */
function gapDe(className: string): number {
  const m = className
    .split(/\s+/)
    .map(c => c.match(/^(?:[a-z]+:)?gap-(\d+|\[\d+px\])$/))
    .find(Boolean);
  if (!m) throw new Error(`o trilho não declara um \`gap\` que o teste saiba ler: ${className}`);
  return escalaTailwind(m[1])!;
}

// ─── Harness da tela (o mesmo da E16: o componente REAL, sem wrapper de dados) ───
const VAZIO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
};
const item = (over: Record<string, unknown> = {}) => makeTaskRow(over) as unknown as WorkItem;

function renderQuadro(byStatus: Partial<Record<WorkItemStatus, WorkItem[]>> = {}) {
  return render(
    <TooltipProvider>
      <div data-testid="tasks-module">
        <TasksBoardMode
          byStatus={{ ...VAZIO, ...byStatus }}
          isLoading={false}
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

/** O trilho é o pai das colunas (`data-board-column` é do próprio componente). */
function colunasMontadas(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-board-column]'));
}

describe('etapa 099 — abaixo de 768px: uma coluna por vez, com abas no topo', () => {
  const CAIXA = item({ id: 'b1', title: 'Ligar para o cliente', status: 'backlog' });
  const FAZENDO = item({ id: 'd1', title: 'Orçamento da feira', status: 'doing' });

  it('monta uma coluna só, nomeia as abas e troca de coluna pelo clique', async () => {
    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      const { container } = renderQuadro({ backlog: [CAIXA], doing: [FAZENDO] });

      const abas = await screen.findByTestId('board-tabs');
      expect(abas).toHaveAttribute('role', 'tablist');
      expect(abas.getAttribute('aria-label'), 'a faixa de abas precisa de nome acessível').toBeTruthy();

      const botoes = within(abas).getAllByRole('tab');
      expect(botoes.map(b => b.textContent)).toEqual([
        'Entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluído',
      ]);

      // UMA coluna por vez — a primeira (Caixa de entrada) é a que está à vista.
      const colunas = colunasMontadas(container);
      expect(colunas).toHaveLength(1);
      expect(colunas[0]).toHaveAttribute('data-board-column', 'backlog');
      expect(within(colunas[0]).getByText('Ligar para o cliente')).toBeTruthy();
      expect(screen.queryByText('Orçamento da feira'), 'a coluna fora da aba não pode ficar montada').toBeNull();

      // O painel da aba é o contêiner da coluna (tablist → tabpanel).
      const painel = container.querySelector<HTMLElement>('[role="tabpanel"]')!;
      expect(botoes[0]).toHaveAttribute('aria-controls', painel.id);
      expect(painel).toHaveAttribute('aria-labelledby', botoes[0].id);
      expect(botoes[0]).toHaveAttribute('aria-selected', 'true');

      // Trocar de aba troca a coluna montada — e o cartão da outra coluna aparece.
      fireEvent.click(within(abas).getByRole('tab', { name: 'Fazendo' }));
      const depois = colunasMontadas(container);
      expect(depois).toHaveLength(1);
      expect(depois[0]).toHaveAttribute('data-board-column', 'doing');
      expect(within(depois[0]).getByText('Orçamento da feira')).toBeTruthy();
      expect(screen.queryByText('Ligar para o cliente')).toBeNull();
      expect(within(abas).getByRole('tab', { name: 'Fazendo' })).toHaveAttribute('aria-selected', 'true');
    } finally {
      devolverMidia();
    }
  });

  it('nenhum contêiner do quadro rola de lado: o trilho é uma coluna e a faixa de abas quebra linha', async () => {
    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      const { container } = renderQuadro({ backlog: [CAIXA] });
      const abas = await screen.findByTestId('board-tabs');
      const coluna = colunasMontadas(container)[0];

      // A faixa de abas é a única "trilha" horizontal: ela quebra linha em vez de rolar.
      expect(abas.className).toContain('flex-wrap');
      expect(abas.className).not.toContain('overflow-x-auto');

      // A coluna e todos os seus ancestrais até o quadro estão sem rolagem horizontal.
      for (let no: HTMLElement | null = coluna; no && no !== container.parentElement; no = no.parentElement) {
        expect(no.className ?? '', `ancestral ${no.tagName} declara rolagem horizontal`).not.toContain('overflow-x-auto');
        expect(no.className ?? '').not.toContain('snap-x');
      }
    } finally {
      devolverMidia();
    }
  });

  it('as abas andam só com o teclado (setas, Home e End) e mantêm um ponto de tabulação', async () => {
    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      renderQuadro({ backlog: [CAIXA], doing: [FAZENDO] });
      const abas = await screen.findByTestId('board-tabs');
      const botoes = within(abas).getAllByRole('tab');

      // Roving tabIndex: só a aba ativa é parada do Tab.
      expect(botoes.map(b => b.tabIndex)).toEqual([0, -1, -1, -1, -1]);

      botoes[0].focus();
      fireEvent.keyDown(botoes[0], { key: 'ArrowRight' });
      expect(within(abas).getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
      expect(document.activeElement).toBe(within(abas).getAllByRole('tab')[1]);

      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' });
      expect(within(abas).getAllByRole('tab')[4]).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
      expect(within(abas).getAllByRole('tab')[0], 'a seta dá a volta na faixa').toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
      expect(within(abas).getAllByRole('tab')[4]).toHaveAttribute('aria-selected', 'true');

      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
      expect(within(abas).getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
    } finally {
      devolverMidia();
    }
  });

  it('as 5 abas mantêm alvo de toque de 40px, sem classe contradizendo o piso', async () => {
    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      renderQuadro({ backlog: [CAIXA] });
      const abas = await screen.findByTestId('board-tabs');
      const botoes = within(abas).getAllByRole('tab');
      expect(botoes).toHaveLength(5);

      // Todo `min-h-*` declarado em cada aba, já convertido para px — inclusive
      // variante com prefixo, porque é ela que vence no cascade quando vale.
      const pisos = botoes.map(b =>
        b.className
          .split(/\s+/)
          .filter(c => /^(?:[a-z]+:)?min-h-/.test(c))
          .map(c => {
            const px = escalaTailwind(c.replace(/^((?:[a-z]+:)?)min-h-/, ''));
            if (px === null) throw new Error(`o teste não sabe converter a altura da aba: ${c}`);
            return px;
          }),
      );

      // As cinco abas continuam iguais entre si: nenhuma com piso próprio.
      expect(
        pisos.every(p => p.join('/') === pisos[0].join('/')),
        `as abas divergem no piso de altura: ${pisos.map(p => p.join('+')).join(' | ')}`,
      ).toBe(true);

      for (const [i, p] of pisos.entries()) {
        expect(p.length, `aba ${i} não declara altura mínima`).toBeGreaterThan(0);
        for (const px of p) {
          expect(px, `aba ${i}: ${px}px fica abaixo do alvo de toque de 40px`).toBeGreaterThanOrEqual(40);
        }
      }
    } finally {
      devolverMidia();
    }
  });

  it('a tela estreita do Quadro passa no axe', async () => {
    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      const { container } = renderQuadro({ backlog: [CAIXA] });
      await screen.findByTestId('board-tabs');
      expect(await axe(container)).toHaveNoViolations();
    } finally {
      devolverMidia();
    }
  });
});

describe('etapa 099 — as cinco colunas sem rolagem a partir de 1280px', () => {
  it('o trilho é uma grade: 2 faixas em 768 e 5 faixas em 1280, sem rolagem horizontal', () => {
    const { container } = renderQuadro({ todo: [item()] });
    const colunas = colunasMontadas(container);
    expect(colunas).toHaveLength(5);

    const trilho = colunas[0].parentElement!;
    expect(trilho.className, 'o trilho deixa de ser o carrossel: agora é grade').toContain('grid');
    expect(trilho.className).not.toContain('overflow-x-auto');
    expect(trilho.className).not.toContain('snap-x');
    expect(trilho.className).toMatch(/(^|\s)md:grid-cols-2(\s|$)/);
    expect(trilho.className).toMatch(/(^|\s)lg:grid-cols-3(\s|$)/);
    expect(trilho.className).toMatch(/(^|\s)xl:grid-cols-5(\s|$)/);

    const gap = gapDe(trilho.className);
    const sidebar = tokenPx('sidebar-w');
    const gutter = tokenPx('layout-gutter');

    // ── 768px (md): duas faixas, e o piso de 200px cabe dentro de cada uma ──
    const disponivel768 = 768 - sidebar - gutter * 2;
    const pisoMd = pisoNaFaixa(colunas[0].className, 'md');
    expect(pisoMd, 'o piso legível da coluna em md').toBe(200);
    expect(pisoMd * 2 + gap, `em 768 com sidebar (${sidebar}px) + 2×gutter: as 2 colunas pedem ${pisoMd * 2 + gap}px`)
      .toBeLessThanOrEqual(disponivel768);

    // ── 1024px (lg): três faixas com o mesmo piso ──
    const disponivel1024 = 1024 - sidebar - gutter * 2;
    expect(pisoMd * 3 + gap * 2, `em 1024: as 3 colunas pedem ${pisoMd * 3 + gap * 2}px`)
      .toBeLessThanOrEqual(disponivel1024);

    // ── 1280px (xl): cinco faixas de largura igual (minmax(0,1fr)) ──
    const disponivel1280 = 1280 - sidebar - gutter * 2;
    const faixa = (disponivel1280 - gap * 4) / 5;
    expect(faixa, 'cada uma das 5 colunas em 1280px').toBeGreaterThanOrEqual(160);
    const pisoXl = pisoNaFaixa(colunas[0].className, 'xl');
    expect(pisoXl, 'em xl a coluna não impõe piso: quem manda é a faixa de 1fr')
      .toBeLessThanOrEqual(faixa);
    // E o `xl:min-w-0` não é enfeite: com o piso de md o conjunto estouraria 1280.
    expect(pisoMd * 5 + gap * 4, `sem soltar o piso em xl, as 5 colunas pedem ${pisoMd * 5 + gap * 4}px`)
      .toBeGreaterThan(disponivel1280);
  });

  it('as colunas continuam iguais entre si e nenhuma fixa a largura', () => {
    const { container } = renderQuadro({ todo: [item()] });
    const colunas = colunasMontadas(container);

    const larguras = colunas.map(c =>
      c.className.split(/\s+/).find(t => /^(?:[a-z]+:)?w-/.test(t)) ?? null,
    );
    expect(new Set(larguras).size, `nenhuma coluna pode fixar largura: ${larguras.join('/')}`).toBe(1);
    expect(larguras[0]).toBeNull();
    for (const [i, coluna] of colunas.entries()) {
      expect(coluna.className, `coluna ${i} não pode travar o encolhimento`).not.toMatch(/(^|\s)shrink-0(\s|$)/);
    }
  });
});
