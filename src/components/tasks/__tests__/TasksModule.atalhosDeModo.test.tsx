/**
 * E20 (fusão Quadro→Tarefas): as teclas 1/2/3 do modo e a preferência salva.
 *
 * O `TasksModule` não instala listener de teclado: quem lê a tecla é o registry
 * global (`useGlobalKeyboardShortcuts` + `defaultShortcuts`, escopo
 * `tasks`), que avisa o módulo pelo evento `tasks-shortcut` com
 * `{ id: 'tasks-mode', key: '1'|'2'|'3' }`. Aqui o registry de VERDADE é montado
 * junto do módulo, então a tecla entra pelo `keydown` de janela e o teste
 * percorre o fluxo inteiro — tecla → registry → evento → módulo. (O outro
 * arquivo dispara o evento à mão; aqui a porta de entrada também é exercitada.)
 *
 * As três pontas provadas:
 *
 *   1. a tecla troca o modo — Quadro (2), Agenda (3), Lista (1) — no mesmo
 *      estado (`data-mode`) que escolhe o modo renderizado;
 *   2. a troca GRAVA `tasks-mode`, e a montagem seguinte abre no modo salvo
 *      (a preferência volta a ser LIDA pelo módulo, não só escrita por ele);
 *   3. a troca NÃO dispara request novo (B13): uma única query serve os três
 *      modos — contada na fronteira (o `select` do cliente Supabase falso),
 *      com o componente e o hook reais.
 *
 * Fica em arquivo próprio porque E20 proíbe editar `TasksModule.test.tsx`. Lá
 * o B13 é medido pelos BOTÕES do switcher e o atalho é medido sem `tasks-mode`
 * e sem contagem de request: o que falta é o cruzamento dos dois.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
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
import { useGlobalKeyboardShortcuts } from '@/hooks/ui/useGlobalKeyboardShortcuts';
import { TooltipProvider } from '@/components/ui/tooltip';

const MODE_STORAGE_KEY = 'tasks-mode';

/** O registry global, do jeito que a app monta (ele lê a view da URL `?view=`). */
function Registry() {
  useGlobalKeyboardShortcuts();
  return null;
}

function renderModule() {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      <Registry />
      {/* O board usa `Tooltip` (BoardColumn) e a app fornece o provider em
          AppProviders; o harness monta o mesmo contexto (como em taskComponents). */}
      <TooltipProvider>
        <Wrapper>
          <TasksModule />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** Modo que o `ModeSwitcher` está exibindo — o mesmo estado que escolhe o modo renderizado. */
function modoAtual() {
  return screen.getByTestId('tasks-mode').getAttribute('data-mode');
}

/** Tecla de verdade na janela: o registry escuta `keydown` em captura. */
function teclar(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/** Monta o módulo (com o registry) e espera a primeira carga ter saído. */
async function montar() {
  renderModule();
  await waitFor(() => expect(h.select).toHaveBeenCalled());
  await waitFor(() => expect(modoAtual()).toBeTruthy());
}

describe('TasksModule — E20 (atalhos 1/2/3 do modo e a preferência salva)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    // a view canônica em que os 7 atalhos do módulo valem (escopo do registry)
    window.history.replaceState(null, '', '/?view=tasks');
    setSelectResult({ data: [makeTaskRow()], error: null });
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  it('as teclas 2, 3 e 1 trocam o modo (Quadro, Agenda, Lista)', async () => {
    await montar();

    teclar('2');
    await waitFor(() => expect(modoAtual()).toBe('board'));

    teclar('3');
    await waitFor(() => expect(modoAtual()).toBe('agenda'));

    teclar('1');
    await waitFor(() => expect(modoAtual()).toBe('list'));
  });

  it('a tecla grava `tasks-mode` e a montagem seguinte abre no modo salvo', async () => {
    await montar();
    // entrar na tela não grava nada: a preferência nasce da tecla, não da visita
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBeNull();

    teclar('2');
    await waitFor(() => expect(modoAtual()).toBe('board'));
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('board');

    teclar('3');
    await waitFor(() => expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('agenda'));

    // remonta sem props de rota: quem manda é a preferência salva pela tecla
    cleanup();
    renderModule();
    await waitFor(() => expect(modoAtual()).toBe('agenda'));
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('agenda');
  });

  it('trocar de modo pela tecla não dispara request novo (B13)', async () => {
    await montar();
    await waitFor(() => expect(h.select).toHaveBeenCalledTimes(1));

    teclar('2');
    await waitFor(() => expect(modoAtual()).toBe('board'));
    teclar('3');
    await waitFor(() => expect(modoAtual()).toBe('agenda'));
    teclar('1');
    await waitFor(() => expect(modoAtual()).toBe('list'));

    // as três trocas saíram da MESMA query da carga inicial
    expect(h.select).toHaveBeenCalledTimes(1);
    // e a tarefa carregada continua na tela: nenhum modo ficou sem dados
    await waitFor(() => expect(screen.getAllByText('Ligar para o cliente').length).toBeGreaterThan(0));
  });
});
