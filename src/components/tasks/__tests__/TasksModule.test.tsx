/**
 * B13 (etapa 20): trocar Lista <-> Quadro <-> Agenda NAO gera request.
 *
 * Antes o `TasksModule` passava `{ includeDone: mode === 'board' }` para o hook,
 * o que mudava a query key e refazia a busca a cada troca de modo. Agora existe
 * uma unica query e a contagem de `select` no cliente Supabase prova isso.
 *
 * O mock vem de `@/test/mocks/tarefas` (mesmo harness do teste do hook).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  supabaseMock as h,
  makeQueryClient,
  makeTaskRow,
  makeWrapper,
  resetSupabaseMock,
  setSelectResult,
} from '@/test/mocks/tarefas';

import { TasksModule } from '@/components/tasks/TasksModule';
import type { TaskMode } from '@/components/tasks/shared/ModeSwitcher';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TASKS_ROUTE_PROPS } from '@/pages/viewRouteProps';

const MODE_STORAGE_KEY = 'tasks-mode';

function renderModule(props: { defaultMode?: TaskMode; forceMode?: boolean } = {}) {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      {/* O board usa `Tooltip` (BoardColumn) e a app fornece o provider em
          AppProviders; o harness monta o mesmo contexto (como em taskComponents). */}
      <TooltipProvider>
        <Wrapper>
          <TasksModule {...props} />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** Modo que o `ModeSwitcher` esta exibindo — o mesmo estado que escolhe o modo renderizado. */
function modoAtual() {
  return screen.getByTestId('tasks-mode').getAttribute('data-mode');
}

describe('TasksModule — B13 (uma query para os tres modos)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    setSelectResult({ data: [makeTaskRow()], error: null });
  });

  it('mantem 1 request ao alternar Lista -> Quadro -> Agenda', async () => {
    renderModule();

    // carga inicial das tarefas = 1 select
    await waitFor(() => expect(h.select).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Ligar para o cliente')).toBeTruthy());

    // Lista -> Quadro (o botao do ModeSwitcher)
    fireEvent.click(screen.getByText('Quadro'));
    await waitFor(() => {
      expect(screen.getByTestId('tasks-mode').getAttribute('data-mode')).toBe('board');
    });
    expect(h.select).toHaveBeenCalledTimes(1);

    // Quadro -> Agenda
    fireEvent.click(screen.getByText('Agenda'));
    await waitFor(() => {
      expect(screen.getByTestId('tasks-mode').getAttribute('data-mode')).toBe('agenda');
    });
    expect(h.select).toHaveBeenCalledTimes(1);

    // volta para a Lista: o titulo carregado na primeira query continua ali
    fireEvent.click(screen.getByText('Lista'));
    await waitFor(() => {
      expect(screen.getByTestId('tasks-mode').getAttribute('data-mode')).toBe('list');
    });
    expect(h.select).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Ligar para o cliente').length).toBeGreaterThan(0);
  });
});

/**
 * B7 (etapa 47): o modulo e o MESMO para os dois itens do menu, e o que os
 * diferencia e o contrato de entrada da rota —
 * `?view=pipeline` abre SEMPRE no Quadro; `?view=tasks` retoma o ultimo modo
 * salvo (ou a Lista). A preferencia so e gravada quando o usuario troca de modo.
 */
describe('TasksModule — B7 (etapa 47: modo por rota)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    setSelectResult({ data: [makeTaskRow()], error: null });
  });

  it('`?view=pipeline` (forceMode) abre no Quadro mesmo com outro modo salvo', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'agenda');

    renderModule({ defaultMode: 'board', forceMode: true });

    await waitFor(() => expect(modoAtual()).toBe('board'));
    // entrar pela rota nao reescreve a preferencia do usuario
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('agenda');
  });

  it('a rota `pipeline` do ViewRouter entrega Quadro + forceMode', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'agenda');

    renderModule(TASKS_ROUTE_PROPS.pipeline);

    await waitFor(() => expect(modoAtual()).toBe('board'));
  });

  it('`?view=tasks` retoma o ultimo modo salvo', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'agenda');

    renderModule();

    await waitFor(() => expect(modoAtual()).toBe('agenda'));
  });

  it('`?view=tasks` sem nada salvo cai na Lista', async () => {
    renderModule();

    await waitFor(() => expect(modoAtual()).toBe('list'));
  });

  it('trocar de modo no switcher grava a preferencia', async () => {
    renderModule({ defaultMode: 'board', forceMode: true });
    await waitFor(() => expect(modoAtual()).toBe('board'));

    fireEvent.click(screen.getByText('Agenda'));

    await waitFor(() => expect(modoAtual()).toBe('agenda'));
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('agenda');
  });
});

/**
 * Etapa 43: o subtítulo do `PageHeader` deixa de ser texto fixo e passa a
 * mostrar as contagens reais — abertas (tudo que não está concluído) e para
 * hoje — formatadas em pt-BR e com singular correto.
 */
describe('TasksModule — etapa 43 (subtítulo com contagens reais)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
  });

  it('mostra abertas e para hoje com os números da carga', async () => {
    setSelectResult({
      data: [
        makeTaskRow({ id: 'a', status: 'todo' }),
        makeTaskRow({ id: 'b', status: 'doing' }),
        makeTaskRow({ id: 'c', status: 'waiting' }),
        makeTaskRow({ id: 'd', status: 'todo', due_date: new Date().toISOString() }),
        makeTaskRow({ id: 'e', status: 'done', completed_at: '2026-09-30T10:00:00.000Z' }),
      ],
      error: null,
    });

    renderModule();

    // 4 nao concluidas (a, b, c, d) e 1 delas vence hoje; a concluida nao conta
    await waitFor(() => expect(screen.getByText('4 abertas · 1 para hoje')).toBeTruthy());
  });

  it('usa singular com uma única tarefa aberta', async () => {
    setSelectResult({
      data: [makeTaskRow({ id: 'a', status: 'todo', due_date: new Date().toISOString() })],
      error: null,
    });

    renderModule();

    await waitFor(() => expect(screen.getByText('1 aberta · 1 para hoje')).toBeTruthy());
  });

  it('formata milhar em pt-BR (1.234, não 1234)', async () => {
    setSelectResult({
      data: Array.from({ length: 1234 }, (_, i) => makeTaskRow({ id: `t${i}`, status: 'todo' })),
      error: null,
    });

    renderModule();

    await waitFor(() => expect(screen.getByText('1.234 abertas · 0 para hoje')).toBeTruthy());
  });
});
