/**
 * F4 (auditoria F3) — a decisão declarada de 30/09/2026, agora com teste:
 *
 *   "Filtro é recorte de TELA": o que descreve a TELA segue o filtro (cards,
 *   colunas, KPIs em geral). O que descreve o TRABALHO REAL — o subtítulo do
 *   cabeçalho do módulo, o card de KPI "Fazendo" e a trava de WIP do Quadro —
 *   continua contando a lista NÃO filtrada.
 *
 * Estes casos fecham as mutações M19, M20, M23, M24 e M25, que a auditoria
 * adversarial de 30/09 registrou como SOBREVIVENTES (a suíte não pegava a
 * mudança). Cada asserção abaixo morre quando a decisão é desfeita no código.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
} from '@/test/mocks/tarefas';
import { TasksModule } from '@/components/tasks/TasksModule';
import type { TaskMode } from '@/components/tasks/shared/ModeSwitcher';
import { TooltipProvider } from '@/components/ui/tooltip';

function renderModule(props: { defaultMode?: TaskMode; forceMode?: boolean } = {}) {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <Wrapper>
          <TasksModule {...props} />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** Valor de um card do KPI pelo rótulo (`n` ou `n/3` na trava de WIP). */
function kpiValor(label: string): string {
  const strip = within(screen.getByTestId('tasks-kpi-strip'));
  const card = strip.getByText(label).closest('[data-testid="kpi-card"]');
  return card?.querySelector('[data-testid="kpi-value"]')?.textContent ?? '<sem card>';
}

/** O subtítulo do cabeçalho — "6 abertas · 3 para hoje" vive num único nó. */
function subtitulo(): string {
  return screen.getByText(/aberta/).textContent ?? '';
}

/** A coluna do Quadro pelo rótulo (o container da coluna é o `min-w-[232px]`). */
function colunaComLabel(label: string): HTMLElement {
  for (const el of screen.getAllByText(label)) {
    let n: HTMLElement | null = el as HTMLElement;
    while (n && !String(n.className ?? '').includes('min-w-[232px]')) n = n.parentElement;
    if (n) return n;
  }
  throw new Error('coluna nao encontrada: ' + label);
}

/**
 * 1 urgente + 2 médias com prazo HOJE + 3 "fazendo" médios.
 * Com `?prio=urgent` o recorte mostra 1 item, mas o dado real tem 6 abertos,
 * 3 para hoje e 3 em "fazendo" (a trava de WIP é 3).
 */
function cenario() {
  const hoje = new Date().toISOString();
  setSelectResult({
    data: [
      makeTaskRow({ id: 'u1', title: 'Urgente hoje',  status: 'todo',  priority: 'urgent', due_date: hoje }),
      makeTaskRow({ id: 'm1', title: 'Media hoje 1', status: 'todo',  priority: 'medium', due_date: hoje }),
      makeTaskRow({ id: 'm2', title: 'Media hoje 2', status: 'todo',  priority: 'medium', due_date: hoje }),
      makeTaskRow({ id: 'd1', title: 'Fazendo 1',    status: 'doing', priority: 'medium' }),
      makeTaskRow({ id: 'd2', title: 'Fazendo 2',    status: 'doing', priority: 'medium' }),
      makeTaskRow({ id: 'd3', title: 'Fazendo 3',    status: 'doing', priority: 'medium' }),
    ],
    error: null,
  });
}

describe('TasksModule — F4: dado real × recorte do filtro na MESMA tela', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/?prio=urgent');
  });

  it('o subtítulo conta o dado REAL e os KPIs contam o RECORTE (M23, M24, M25)', async () => {
    cenario();
    renderModule({ defaultMode: 'list' });
    await screen.findByText('Urgente hoje');

    // Cabeçalho = trabalho real. Se alguém trocar `byStatusReal`/`kpiReal` pelo
    // recorte (mutação M23), isto vira "1 aberta · 1 para hoje" e o caso morre.
    expect(subtitulo()).toContain('6 abertas');
    expect(subtitulo()).toContain('3 para hoje');

    // Card "Fazendo" = trava de WIP = dado real (3 de 3). M24 (KPI com
    // `kpiData.doingCount`) e M25 (`countDoing(items)`) derrubam esta linha.
    expect(kpiValor('Fazendo')).toBe('3/3');

    // Os demais KPIs são a tela: só o item urgente casa o filtro.
    expect(kpiValor('Para hoje')).toBe('1');
  });

  it('a coluna Fazendo mostra o RECORTE, mas o cabeçalho dela segue a trava real (M19, M20, M27)', async () => {
    cenario();
    renderModule({ defaultMode: 'board' });
    await screen.findByText('Urgente hoje');

    const col = colunaComLabel('Fazendo');

    // Recorte: nenhum card — os três "fazendo" são médios e o filtro é urgente.
    expect(within(col).queryAllByTestId('work-item-card')).toHaveLength(0);

    // Trava real: o cabeçalho da coluna continua anunciando 3/3. Sem a prop
    // `doingCount` (mutação M19/M20/M27) ele cairia para 0/3 e o drop seria
    // liberado por uma contagem que a tela esconde.
    expect((col.firstElementChild as HTMLElement).textContent).toContain('3/3');
  });
});
