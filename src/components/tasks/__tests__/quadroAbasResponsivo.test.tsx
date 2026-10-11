/**
 * Etapas 099 e 100 do plano de design do módulo
 * (`~/hermes-workspaces/.assets/tarefas/PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS_2026-10-11.md`):
 *
 *  · 099 — **Responsivo do Quadro**: abaixo de 768px uma coluna por vez com
 *    abas no topo; a partir de 1280px as cinco colunas sem rolagem.
 *  · 100 — **Faixa compacta e abas do Quadro**: a faixa compacta de KPIs já
 *    existe no modo Quadro (`data-density="compact"`, etapa 025) e é medida em
 *    `kpiStripTarefas.test.tsx`; o que este arquivo fecha é o **estilo das abas
 *    conforme D3** — o ativo preenchido com a cor primária, a mesma linguagem
 *    do seletor de modos e do toggle "Concluídas".
 *
 * O jsdom não calcula layout, então a prova da responsividade é ARITMÉTICA e de
 * CONTRATO DE CLASSE sobre o que o componente REAL renderiza (mesma técnica da
 * E16 em `quadroLarguraFocoContraste.test.tsx`):
 *  - as abas e o papel de cada coluna à vista (estado real de `colunaVisivel`);
 *  - a classe que faz a coluna tomar o trilho inteiro abaixo de 768px;
 *  - o piso `min-w-[200px]` das 5 colunas + os vãos contra o corte de 1280px.
 *
 * O que este arquivo NÃO prova: a medida no navegador (o olho logado da etapa
 * 106) e a rolagem de verdade (o `overflow-x-auto` do trilho é a válvula de
 * escape, provada por classe).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import { makeTaskRow } from '@/test/mocks/tarefas';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** O `@hello-pangea/dnd` não roda no jsdom — mesmo mock de `quadroLarguraFocoContraste`. */
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: { children: ReactNode }) => children,
  Droppable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (p: unknown, s: unknown) => ReactNode }) =>
    children({ innerRef: () => undefined, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

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

/** Mente sobre as media queries do ambiente e devolve o desfazer (§ pointerMedia.ts). */
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

/** Tela estreita: uma coluna por vez, com abas no topo (etapa 099). */
const TELA_ESTREITA = (consulta: string) => consulta.includes('max-width: 767px');

/** Rótulos das 5 colunas como o produto os chama — lista LITERAL (não cópia do código). */
const ROTULOS = ['Caixa de entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluído'];

/** O trilho e as colunas, pelo `data-board-column` que a `BoardColumn` expõe. */
function trilhoEcolunas() {
  const colunas = Array.from(screen.getByTestId('tasks-module').querySelectorAll<HTMLElement>('[data-board-column]'));
  const trilho = colunas[0]?.parentElement;
  if (!trilho) throw new Error('o trilho das colunas não foi encontrado');
  return { trilho, colunas };
}

/** Piso que o flexbox não encolhe: a MAIOR `min-w-*` aplicável da coluna. */
function pisoPx(className: string): number {
  let piso = 0;
  for (const cls of className.split(/\s+/)) {
    const m = cls.match(/(?:^|:)min-w-\[(\d+)px\]$/);
    if (m) piso = Math.max(piso, Number(m[1]));
  }
  return piso;
}

/** Vão entre as colunas, lido do próprio trilho (`gap-3` = 12px). */
function gapPx(className: string): number {
  const m = className.split(/\s+/).map(c => c.match(/^(?:[a-z]+:)?gap-(\d+)$/)).find(Boolean);
  if (!m) throw new Error(`o trilho não declara um \`gap\` que o teste saiba ler: ${className}`);
  return Number(m[1]) * 4;
}

beforeEach(() => {
  // Larga por padrão; cada caso liga a tela estreita se precisar.
  window.matchMedia = ((consulta: string) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => cleanup());

describe('E99 — as abas das colunas e o corte de 768px', () => {
  it('as abas só existem abaixo de 768px e nomeiam cada coluna', () => {
    const larga = renderQuadro({ todo: [item()] });
    // Larga: sem abas — as cinco colunas estão lado a lado no trilho.
    expect(screen.queryByTestId('board-tabs')).toBeNull();
    expect(trilhoEcolunas().colunas).toHaveLength(5);
    larga.unmount();

    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      renderQuadro({ todo: [item()] });
      const tablist = screen.getByTestId('board-tabs');
      expect(tablist.getAttribute('role')).toBe('tablist');
      expect(tablist.getAttribute('aria-label')).toBe('Colunas do quadro');

      const abas = screen.getAllByRole('tab');
      expect(abas).toHaveLength(5);
      // Os nomes acessíveis são os rótulos do produto, na ordem das colunas.
      for (const [i, rotulo] of ROTULOS.entries()) {
        expect(abas[i].textContent).toBe(rotulo);
        expect(abas[i].getAttribute('aria-selected'), `aba ${i} (${rotulo})`).toBe(String(i === 0));
      }
    } finally {
      devolverMidia();
    }
  });

  it('clicar na aba muda a coluna à vista, mantém o dot em sincronia e usa o estilo ativo do D3', () => {
    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      renderQuadro({ todo: [item()] });
      const abas = screen.getAllByRole('tab');

      // O ativo nasce preenchido com a cor primária (D3), o inativo não.
      expect(abas[0].className).toMatch(/(^|\s)bg-primary(\s|$)/);
      expect(abas[0].className).toMatch(/(^|\s)text-primary-foreground(\s|$)/);
      expect(abas[3].className).not.toMatch(/(^|\s)bg-primary(\s|$)/);

      fireEvent.click(abas[3]); // "Aguardando"

      const depois = screen.getAllByRole('tab');
      expect(depois[3].getAttribute('aria-selected')).toBe('true');
      expect(depois[3].className).toMatch(/(^|\s)bg-primary(\s|$)/);
      expect(depois[0].getAttribute('aria-selected')).toBe('false');

      // UMA fonte só: o dot (etapa 081) segue a mesma coluna à vista.
      expect(screen.getByRole('button', { name: 'Ir para Aguardando' }))
        .toHaveAttribute('aria-current', 'true');
      expect(screen.getByRole('button', { name: 'Ir para Caixa de entrada' }))
        .not.toHaveAttribute('aria-current');

      // E a seta à direita continua conduzindo a MESMA seleção.
      fireEvent.click(screen.getByTestId('board-next'));
      expect(screen.getAllByRole('tab')[4].getAttribute('aria-selected')).toBe('true');
    } finally {
      devolverMidia();
    }
  });

  it('abaixo de 768px a coluna toma a largura do trilho (uma por vez) sem perder o piso flexível', () => {
    const devolverMidia = fingirMidia(TELA_ESTREITA);
    try {
      renderQuadro({ todo: [item()] });
      const { colunas } = trilhoEcolunas();
      expect(colunas).toHaveLength(5);

      for (const [i, coluna] of colunas.entries()) {
        // Toma o trilho inteiro: base 100% e sem encolher — o snap mostra UMA por vez.
        expect(coluna.className, `coluna ${i} não toma o trilho`).toMatch(/(^|\s)max-md:basis-full(\s|$)/);
        expect(coluna.className, `coluna ${i} pode encolher abaixo de 768px`).toMatch(/(^|\s)max-md:shrink-0(\s|$)/);
        // E segue dividindo a largura com o piso legível do md para cima.
        expect(coluna.className, `coluna ${i} perdeu o flex-1`).toMatch(/(^|\s)flex-1(\s|$)/);
        expect(pisoPx(coluna.className), `coluna ${i} perdeu o piso de 200px`).toBe(200);
      }
    } finally {
      devolverMidia();
    }
  });
});

describe('E99 — a partir de 1280px as cinco colunas cabem sem rolagem', () => {
  it('5 × piso + os vãos não passam de 1280px (o trilho rola só como válvula de escape)', () => {
    renderQuadro({ todo: [item()] });
    const { trilho, colunas } = trilhoEcolunas();
    expect(colunas).toHaveLength(5);

    const piso = pisoPx(colunas[0].className);
    expect(new Set(colunas.map(c => pisoPx(c.className))).size).toBe(1);
    const larguraTotal = piso * colunas.length + gapPx(trilho.className) * (colunas.length - 1);

    expect(larguraTotal, `as 5 colunas pedem ${larguraTotal}px`).toBeLessThanOrEqual(1280);
    // A válvula de escape continua montada para as larguras menores.
    expect(trilho.className).toMatch(/(^|\s)overflow-x-auto(\s|$)/);
  });
});
