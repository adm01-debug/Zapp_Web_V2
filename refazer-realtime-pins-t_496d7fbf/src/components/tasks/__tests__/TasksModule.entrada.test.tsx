/**
 * E19 (plano da fusão Quadro→Tarefas) — o contrato de ENTRADA do módulo:
 * `?view=tasks&task=<id>` abre a folha (`WorkItemSheet`) da tarefa do id,
 * em QUALQUER um dos três modos (Lista, Quadro e Agenda); sem `task`, a tela
 * apenas retoma o modo salvo em `tasks-mode` e não abre folha nenhuma.
 *
 * O ponto que este arquivo protege é a independência entre "modo" e "folha":
 * o modo vem da preferência salva (`tasks-mode`) e a folha vem do id na URL —
 * um não pode depender do outro. Por isso cada caso roda nos três modos.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  resetSupabaseMock,
  setSelectResult,
  makeTaskRow,
  makeQueryClient,
  makeWrapper,
} from '@/test/mocks/tarefas';

import { TasksModule } from '@/components/tasks/TasksModule';
import { TooltipProvider } from '@/components/ui/tooltip';

const MODE_STORAGE_KEY = 'tasks-mode';

/**
 * Os três modos de `ModeSwitcher`, como o `storage` os grava, com o marcador
 * que prova que a carga terminou em cada um. A tarefa da fixture não tem prazo,
 * então a Agenda não a mostra num dia — lá quem indica "carregou" é a faixa de
 * dias (`agenda-day-dots`), que só existe fora do esqueleto.
 */
const MODOS = [
  { modo: 'list', rotulo: 'Lista', carregou: 'work-item-card' },
  { modo: 'board', rotulo: 'Quadro', carregou: 'work-item-card' },
  { modo: 'agenda', rotulo: 'Agenda', carregou: 'agenda-day-dots' },
] as const;

function renderModule() {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      {/* O Quadro usa `Tooltip` (BoardColumn); a app fornece o provider no
          AppProviders e o harness monta o mesmo contexto. */}
      <TooltipProvider>
        <Wrapper>
          <TasksModule />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** Modo que o `ModeSwitcher` está exibindo — o mesmo estado que escolhe a visão. */
function modoAtual() {
  return screen.getByTestId('tasks-mode').getAttribute('data-mode');
}

describe('TasksModule — E19 (deep link `?task=<id>` abre a folha em qualquer modo)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    setSelectResult({ data: [makeTaskRow({ id: 't1', title: 'Ligar para o cliente' })], error: null });
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  it.each(MODOS)('`?view=tasks&task=t1` abre o WorkItemSheet no modo $rotulo', async ({ modo }) => {
    localStorage.setItem(MODE_STORAGE_KEY, modo);
    window.history.replaceState(null, '', '/?view=tasks&task=t1');

    renderModule();

    // o modo salvo é respeitado (o `view=tasks` não força nada)
    expect(modoAtual()).toBe(modo);

    // e a folha da tarefa do id da URL abre em cima desse modo
    const titulo = await screen.findByTestId('sheet-titulo');
    expect((titulo as HTMLInputElement).value).toBe('Ligar para o cliente');
    expect(screen.getByTestId('work-item-sheet')).toBeTruthy();
  });

  it.each(MODOS)('sem `task` a folha não abre e o modo $rotulo é retomado', async ({ modo, carregou }) => {
    localStorage.setItem(MODE_STORAGE_KEY, modo);
    window.history.replaceState(null, '', '/?view=tasks');

    renderModule();

    expect(modoAtual()).toBe(modo);
    // espera a carga terminar para não confundir "não abriu" com "ainda não carregou"
    await waitFor(() => expect(screen.getAllByTestId(carregou).length).toBeGreaterThan(0));
    expect(screen.queryByTestId('work-item-sheet')).toBeNull();
  });
});
