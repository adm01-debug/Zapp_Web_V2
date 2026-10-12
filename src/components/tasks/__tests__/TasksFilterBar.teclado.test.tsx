/**
 * Etapa 047 do plano (seção 8-bis) — navegação por TECLADO da barra de
 * ferramentas de Tarefas.
 *
 * Etapa 047 do plano (linha 292): "Testes de teclado da barra. `/`, 1/2/3, Enter
 * e ordem de foco." Os atalhos são os do registry global (Etapa 77 /
 * `defaultShortcuts`), com escopo `view === 'tasks'`: aqui o registry de VERDADE
 * é montado junto do módulo (`Registry`), então a tecla entra pelo `keydown` de
 * janela e o teste percorre tecla → registry → evento `tasks-shortcut` → módulo,
 * como na app. O que cada caso protege está citado no `it`.
 *
 * Seção 8-bis do plano (linha 512–524) que sustenta os casos:
 *  - G-5 (linha 516) "Etapa 041 mantém só os atalhos 1/2 e `!`": os atalhos
 *    1/2/3 cobertos aqui são do MODO (Etapa 77, escopo `tasks`) e não os do
 *    campo de captura (Etapa 41, `ctrl+1/2/3` dentro do QuickAdd) — nenhum
 *    parser de linguagem natural foi criado ou testado aqui;
 *  - B13 (linha 520) "Uma query só para os três modos": trocar o modo pela tecla
 *    não pode disparar consulta nova — contado na fronteira (o `select` do
 *    cliente Supabase falso);
 *  - Fase F (linha 524) "Filtro é recorte de TELA": a busca segue sendo recorte
 *    de tela, então trocar o modo pela tecla não descarta o recorte nem o texto.
 *
 * O harness de render (o `TasksModule` montado, com a barra, o `useTasksFilters`
 * e a URL de verdade) e os mocks (`@/test/mocks/tarefas`) são os da família da
 * Etapa 046. O arquivo de teste daquela etapa (`TasksFilterBar.test.tsx`) NÃO
 * está no meu tronco (dia/2026-10-12) — a entrega dela segue a fila do
 * integrador —, então o harness foi ESCRITO aqui no mesmo padrão, em vez de o
 * arquivo alheio ser trazido por cherry-pick (armadilha 1 da skill
 * `armadilhas-workertestes`). Nada de produção foi alterado: só este arquivo.
 *
 * Radix (Select/Popover) exige os métodos de captura de ponteiro, ausentes no
 * jsdom — o polyfill é o mesmo de `cardAcoes.test.tsx`/`WorkItemSheet.test.tsx`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  supabaseMock as h,
  resetSupabaseMock,
  setSelectResult,
  makeTaskRow,
  makeQueryClient,
  makeWrapper,
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

/** O módulo montado com o registry de verdade: a tecla entra pela janela. */
function renderModule() {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      <Registry />
      {/* O board usa `Tooltip` (BoardColumn) e a app fornece o provider em AppProviders. */}
      <TooltipProvider>
        <Wrapper>
          <TasksModule />
        </Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

/** Tecla de verdade na janela: o registry escuta `keydown` em captura.
 *  `alvo` simula a tecla digitada DENTRO de um campo (o `target` é o campo). */
function teclar(key: string, alvo: EventTarget = window) {
  act(() => {
    alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

const CONTATO = { id: 'c1', name: 'Ana Souza', phone: null, avatar_url: null };

/** Carga base: uma aberta urgente com contato e uma concluída hoje. */
function cargaBase() {
  return [
    makeTaskRow({ id: 'a', title: 'Ligar', status: 'todo', priority: 'urgent', contact: CONTATO, contact_id: 'c1' }),
    makeTaskRow({ id: 'b', title: 'Feita', status: 'done', completed_at: new Date().toISOString() }),
  ];
}

/** Monta com o Quadro (a concluída recente fica visível na coluna Concluído,
 *  G-8) e espera a barra e a primeira carga saírem. */
async function montarBarra() {
  localStorage.setItem(MODE_STORAGE_KEY, 'board');
  window.history.replaceState(null, '', '/?view=tasks');
  setSelectResult({ data: cargaBase(), error: null });
  renderModule();
  await waitFor(() => expect(h.select).toHaveBeenCalled());
  return screen.findByTestId('tasks-filter-bar');
}

const busca = () => screen.getByRole('searchbox', { name: 'Buscar tarefa' }) as HTMLInputElement;
const modoAtual = () => screen.getByTestId('tasks-mode').getAttribute('data-mode');

beforeEach(() => {
  cleanup();
  resetSupabaseMock();
  localStorage.clear();
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  cleanup();
});

describe('Etapa 047 — atalho `/` foca a busca', () => {
  it('`/` leva o foco à busca quando o foco não está num campo de texto', async () => {
    await montarBarra();
    // foco fora de campo de texto (o corpo da página)
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.body.focus();
    expect(busca()).not.toBe(document.activeElement);

    teclar('/');

    await waitFor(() => expect(busca()).toBe(document.activeElement));
  });

  it('`/` NÃO dispara com o foco dentro de um campo de texto (guarda de input)', async () => {
    await montarBarra();
    // o campo de captura do módulo é um INPUT: a guarda do registry o protege
    // (no Quadro há um campo de captura por coluna; qualquer um deles serve)
    const captura = screen.getAllByTestId('quick-add-input')[0] as HTMLInputElement;
    captura.focus();
    expect(captura).toBe(document.activeElement);

    teclar('/', captura);

    expect(captura).toBe(document.activeElement);
    expect(busca()).not.toBe(document.activeElement);
  });
});

describe('Etapa 047 — atalhos 1/2/3 do modo', () => {
  it('as teclas 2, 3 e 1 acionam Quadro, Agenda e Lista, com o estado resultante', async () => {
    await montarBarra();

    teclar('2');
    await waitFor(() => expect(modoAtual()).toBe('board'));
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('board');

    teclar('3');
    await waitFor(() => expect(modoAtual()).toBe('agenda'));
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('agenda');

    teclar('1');
    await waitFor(() => expect(modoAtual()).toBe('list'));
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('list');
  });

  it('trocar o modo pela tecla não recorta a barra nem dispara consulta nova (B13)', async () => {
    await montarBarra();
    await waitFor(() => expect(h.select).toHaveBeenCalledTimes(1));

    fireEvent.change(busca(), { target: { value: 'ligar' } });
    await waitFor(() => expect(screen.queryByText('Feita')).toBeNull());

    teclar('2');
    await waitFor(() => expect(modoAtual()).toBe('board'));

    // a barra continua montada, com o texto digitado (Fase F: filtro é recorte de TELA)
    expect(busca().value).toBe('ligar');
    // e a troca de modo saiu da MESMA query da carga inicial (B13)
    expect(h.select).toHaveBeenCalledTimes(1);
  });

  it('`2` digitado DENTRO da busca não troca o modo (guarda de input)', async () => {
    await montarBarra();

    // sai do Quadro pelo atalho de teclado (contexto neutro): agora o modo é Lista
    teclar('1');
    await waitFor(() => expect(modoAtual()).toBe('list'));

    const campo = busca();
    campo.focus();
    teclar('2', campo);

    // o modo não mudou e o foco ficou no campo onde a tecla foi digitada
    expect(campo).toBe(document.activeElement);
    // dá tempo de qualquer troca de modo aparecer (a guarda vale além do render)
    await act(async () => { await new Promise(r => setTimeout(r, 120)); });
    expect(modoAtual()).toBe('list');
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('list');
  });
});

describe('Etapa 047 — Enter confirma a ação do elemento focado', () => {
  it('Enter na busca aplica o recorte e mantém o texto digitado', async () => {
    await montarBarra();
    await screen.findByText('Ligar');

    const campo = busca();
    campo.focus();
    fireEvent.change(campo, { target: { value: 'ligar' } });
    teclar('Enter', campo);

    // o recorte vale (a concluída de outro título sai) e o texto NÃO é limpo
    await waitFor(() => expect(screen.queryByText('Feita')).toBeNull());
    expect(screen.getAllByText('Ligar').length).toBeGreaterThan(0);
    expect(campo.value).toBe('ligar');
  });

  it('Enter no Select de Prioridade escolhe a opção destacada', async () => {
    await montarBarra();
    await screen.findByText('Ligar');

    const gatilho = screen.getByRole('combobox', { name: 'Prioridade' });
    gatilho.focus();
    teclar('Enter', gatilho);

    // abre a lista: o destaque já cai na opção marcada ("Todas as prioridades")
    const lista = await screen.findByRole('listbox');
    const destaque = document.activeElement as HTMLElement;
    expect(lista.contains(destaque)).toBe(true);

    // ArrowDown move o destaque (Radix foca o próximo item de forma assíncrona)
    const opcoes = () => screen.getAllByRole('option').map(o => o.textContent?.trim() ?? '');
    const proxima = opcoes()[1];
    teclar('ArrowDown', destaque);
    await waitFor(() => expect((document.activeElement as HTMLElement).textContent?.trim()).toBe(proxima));

    // Enter confirma o item focado
    teclar('Enter', document.activeElement ?? destaque);

    // a ação foi confirmada: o gatilho passa a mostrar o rótulo escolhido e o
    // recorte chega à URL (o estado do módulo), com a lista fechada
    await waitFor(() => expect(gatilho.textContent).toContain(proxima));
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(new URLSearchParams(window.location.search).get('prio')).toBeTruthy();
  });

  it('Enter no item do popover de Contato marca o contato', async () => {
    await montarBarra();
    await screen.findByText('Ligar');

    const gatilho = screen.getByRole('button', { name: 'Contato' });
    gatilho.focus();
    fireEvent.click(gatilho);

    // o popover abre com a busca de contato focada; a 1ª opção é "Todos os contatos"
    const campo = await screen.findByPlaceholderText('Buscar contato…');
    const opcao = (nome: RegExp) => screen.getByRole('option', { name: nome });

    // o cmdk destaca o item pelo `aria-selected` (o foco continua no campo) e
    // pula o primeiro item do popover, caindo no 1º contato da carga
    teclar('ArrowDown', campo);
    await waitFor(() => expect(opcao(/Ana Souza/)).toHaveAttribute('aria-selected', 'true'));

    // Enter no item destacado confirma a escolha
    teclar('Enter', campo);

    await waitFor(() => expect(gatilho.textContent).toMatch(/Ana Souza/));
  });
});

describe('Etapa 047 — ordem de foco e popover', () => {
  it('a ordem de foco da barra vai da esquerda para a direita, sem armadilha', async () => {
    await montarBarra();

    const barra = screen.getByTestId('tasks-filter-bar');
    // A ordem de TAB do navegador é a ordem de DOCUMENTO dos focáveis: nenhum
    // controle deste módulo tem `tabIndex` positivo, então a ordem lida aqui é a
    // mesma que o Tab percorre (jsdom não move o foco sozinho no Tab).
    const focaveis = Array.from(
      barra.querySelectorAll<HTMLElement>('input, button, [role="switch"], [role="combobox"]')
    ).filter(el => el.tabIndex >= 0 && !el.hasAttribute('disabled'));

    expect(focaveis.map(nomeDe)).toEqual([
      'Buscar tarefa',
      'Prioridade',
      'Contato',
      'Com alarme',
      'Mostrar concluídas',
    ]);
    // sem armadilha: nada puxa o Tab para dentro por `tabindex` positivo
    expect(focaveis.every(el => el.tabIndex === 0)).toBe(true);

    // e o foco SAI da barra ao passar do último controle (não fica preso nela)
    const todosDoModulo = Array.from(
      screen.getByTestId('tasks-module').querySelectorAll<HTMLElement>(
        'input, button, [role="switch"], [role="combobox"]'
      )
    ).filter(el => el.tabIndex >= 0 && !el.hasAttribute('disabled'));
    const depois = todosDoModulo[todosDoModulo.indexOf(focaveis[focaveis.length - 1]) + 1];
    expect(depois).toBeTruthy();
    expect(barra.contains(depois)).toBe(false);
    expect(nomeDe(depois)).toBe('Lista'); // o seletor de modos vem logo depois da barra
  });

  it('Escape fecha o popover de Contato e devolve o foco ao gatilho', async () => {
    await montarBarra();
    await screen.findByText('Ligar');

    const gatilho = screen.getByRole('button', { name: 'Contato' });
    gatilho.focus();
    fireEvent.click(gatilho);
    await screen.findByPlaceholderText('Buscar contato…');
    expect(gatilho).not.toBe(document.activeElement); // o foco foi para dentro do popover

    teclar('Escape', document.activeElement ?? document.body);

    await waitFor(() => expect(screen.queryByPlaceholderText('Buscar contato…')).toBeNull());
    await waitFor(() => expect(gatilho).toBe(document.activeElement));
  });
});

/** Nome acessível mínimo dos controles da barra que este teste percorre. */
function nomeDe(el: HTMLElement): string {
  return (el.getAttribute('aria-label') || el.textContent || '').trim();
}
