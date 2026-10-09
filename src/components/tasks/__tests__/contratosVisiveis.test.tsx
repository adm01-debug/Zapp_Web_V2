/**
 * SL-131 — contratos VISÍVEIS das Tarefas que a auditoria de entregas (RODADA2,
 * 2026-09-30) apontou como NÃO pinados: as mutações que trocavam a ordem ou o
 * rótulo destes pontos passavam verdes.
 *
 *   T1 — ordem visual das colunas do Quadro (`TasksBoardMode`);
 *   T3 — ordem das abas Lista/Quadro/Agenda (`ModeSwitcher`);
 *   T4 — destinos do menu "Mover para" (`WorkItemCard`/`MoveTargets`);
 *   T5 — `shortLabel` das colunas (`workItem.types`);
 *   T6 — o contêiner da linha das colunas é a faixa flex com vão (`.flex.gap-3`).
 *
 * Cada caso mede a ORDEM/RÓTULO que o componente REAL renderiza no DOM (nunca o
 * array do código): trocar a ordem ou o rótulo em produção fica vermelho. O
 * esperado é uma lista LITERAL de propósito — se viesse de `KANBAN_COLUMNS`, o
 * esperado seria cópia do código testado e a asserção viraria tautologia.
 *
 * T2 (ordem das seções da Lista) já está pinado por `TasksListMode.test.tsx`
 * ("renderiza as 6 seções na ordem contratada") — não duplicado aqui.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

// Importa o harness ANTES dos módulos sob teste (registra os `vi.mock`).
import { makeTaskRow } from '@/test/mocks/tarefas';
import { TasksBoardMode } from '@/components/tasks/board/TasksBoardMode';
import { ModeSwitcher } from '@/components/tasks/shared/ModeSwitcher';
import { WorkItemCard } from '@/components/tasks/shared/WorkItemCard';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';

/** Os rótulos das 5 colunas como o produto os mostra (spec do Quadro). */
const ROTULOS_DAS_COLUNAS = ['Caixa de entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluído'];
/** Os `shortLabel` das mesmas 5 colunas — é o texto do menu "Mover para". */
const ROTULOS_CURTOS = ['Entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluído'];

const item = (over: Partial<WorkItem> = {}): WorkItem =>
  makeTaskRow(over as Record<string, unknown>) as unknown as WorkItem;

const VAZIO: Record<WorkItemStatus, WorkItem[]> = {
  backlog: [], todo: [], doing: [], waiting: [], done: [], cancelled: [],
};

function renderQuadro() {
  return render(
    <TooltipProvider>
      <TasksBoardMode
        byStatus={VAZIO}
        isLoading={false}
        onMove={vi.fn()}
        onReorder={vi.fn()}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onCreate={vi.fn()}
      />
    </TooltipProvider>,
  );
}

const kebab = () => screen.getByRole('button', { name: 'Mais opções' });

/** Abre um menu Radix só pelo teclado (jsdom não tem a Pointer Events API). */
const abrir = (el: HTMLElement) => {
  fireEvent.keyDown(el, { key: 'Enter', code: 'Enter' });
  return screen.findByRole('menu');
};

/** Abre o submenu do item indicado (ex.: "Mover para"). */
const abrirSubmenu = (nome: RegExp | string) => {
  const alvo = screen.getByRole('menuitem', { name: nome });
  alvo.focus();
  fireEvent.keyDown(alvo, { key: 'ArrowRight', code: 'ArrowRight' });
};

beforeEach(() => {
  // Radix chama a Pointer Events API, que o jsdom não implementa.
  const proto = Element.prototype as unknown as Record<string, () => unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
});

afterEach(() => cleanup());

describe('Contratos visíveis das Tarefas (T1, T3, T4, T5, T6)', () => {
  it('T1/T6) o Quadro desenha as 5 colunas na ordem contratada, numa faixa flex com vão', () => {
    renderQuadro();

    const colunas = Array.from(document.querySelectorAll<HTMLElement>('[data-board-column]'));
    // A ordem no DOM É a ordem visual (o Quadro não usa `style.order`).
    expect(colunas.map(c => c.getAttribute('data-board-column')))
      .toEqual(['backlog', 'todo', 'doing', 'waiting', 'done']);
    colunas.forEach((coluna, i) => {
      expect(coluna.textContent, `coluna ${i}`).toContain(ROTULOS_DAS_COLUNAS[i]);
    });

    // T6 — as 5 colunas são irmãs na MESMA linha, que é a faixa flex com o vão.
    const trilho = colunas[0].parentElement!;
    expect(trilho.children, 'as colunas e o trilho não podem se separar').toHaveLength(5);
    expect(trilho.className).toMatch(/(^|\s)flex(\s|$)/);
    expect(trilho.className).toMatch(/(^|\s)gap-3(\s|$)/);
  });

  it('T3) as abas do modo seguem Lista, Quadro e Agenda e cada uma troca para o modo dela', () => {
    const onChange = vi.fn();
    const { container } = render(<ModeSwitcher mode="list" onChange={onChange} />);

    const abas = Array.from(container.querySelectorAll('button'));
    expect(abas.map(b => b.textContent?.trim())).toEqual(['Lista', 'Quadro', 'Agenda']);

    // A aba i troca para o modo i — o rótulo não pode andar para o lado errado.
    abas.forEach(aba => fireEvent.click(aba));
    expect(onChange.mock.calls.map(c => c[0])).toEqual(['list', 'board', 'agenda']);
  });

  it('T4/T5) o menu "Mover para" lista as 5 colunas na ordem contratada, com o rótulo curto', async () => {
    render(<WorkItemCard item={item({ status: 'todo' })} mode="board" onMoveTo={vi.fn()} />);

    await abrir(kebab());
    abrirSubmenu(/Mover para/);
    await screen.findByRole('menuitem', { name: 'Fazendo' });

    // Todos os `menuitem` do documento (menu-pai + submenu), na ordem do DOM;
    // só as opções de destino usam `shortLabel`, então o filtro as isola.
    const destinos = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .map(el => el.textContent?.trim() ?? '')
      .filter(texto => ROTULOS_CURTOS.includes(texto));
    expect(destinos).toEqual(ROTULOS_CURTOS);
  });
});
