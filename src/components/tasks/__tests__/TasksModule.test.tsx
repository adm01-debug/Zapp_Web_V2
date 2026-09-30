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
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
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

/**
 * Etapa 45: a barra de filtros (5 controles) com o estado espelhado na URL.
 *
 * Os dois `Select` (prioridade e contato) não são dirigidos por aqui — o radix
 * monta em portal e o clique vira flaky; a regra deles está provada na função
 * pura (`applyFilters`, no teste do agregado), no parse/serialize da URL e no
 * teste do hook. O que este arquivo prova é a integração: barra na tela, filtro
 * recortando os modos e URL refletindo o estado.
 */
describe('TasksModule — etapa 45 (barra de filtros)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    setSelectResult({
      data: [
        makeTaskRow({ id: 'a', title: 'Ligar', status: 'todo' }),
        makeTaskRow({ id: 'b', title: 'Feita', status: 'done', completed_at: new Date().toISOString() }),
      ],
      error: null,
    });
  });

  it('traz os 5 controles e só mostra "Limpar" quando um filtro sai do padrão', async () => {
    renderModule({ defaultMode: 'board' });

    const barra = await screen.findByTestId('tasks-filter-bar');
    expect(within(barra).getByRole('searchbox', { name: 'Buscar tarefa' })).toBeTruthy();
    expect(within(barra).getByLabelText('Prioridade')).toBeTruthy();
    expect(within(barra).getByLabelText('Contato')).toBeTruthy();
    expect(within(barra).getByRole('switch', { name: 'Com alarme' })).toBeTruthy();
    expect(within(barra).getByRole('switch', { name: 'Mostrar concluídas' })).toBeTruthy();
    expect(within(barra).queryByRole('button', { name: /Limpar/ })).toBeNull();
  });

  it('esconder as concluídas recorta o Quadro, escreve done=0 e o "Limpar" desfaz', async () => {
    renderModule({ defaultMode: 'board' });
    expect(await screen.findByText('Feita')).toBeTruthy();

    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar concluídas' }));

    await waitFor(() => expect(screen.queryByText('Feita')).toBeNull());
    // a coluna vazia do Quadro entra no lugar (etapa 46)
    expect(screen.getAllByText('Coluna vazia').length).toBeGreaterThan(0);
    expect(window.location.search).toContain('done=0');

    fireEvent.click(screen.getByRole('button', { name: /Limpar/ }));

    await waitFor(() => expect(screen.getByText('Feita')).toBeTruthy());
    expect(window.location.search).toBe('');
  });

  it('a busca anda no campo na hora e vira filtro depois do debounce, já na URL', async () => {
    renderModule({ defaultMode: 'board' });
    expect(await screen.findByText('Ligar')).toBeTruthy();

    const campo = screen.getByRole('searchbox', { name: 'Buscar tarefa' });
    fireEvent.change(campo, { target: { value: 'liga' } });

    // o valor do campo é imediato; o recorte (e a URL) vêm com o debounce
    expect((campo as HTMLInputElement).value).toBe('liga');
    await waitFor(() => expect(screen.queryByText('Feita')).toBeNull());
    expect(window.location.search).toContain('q=liga');
  });
});

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

/**
 * Etapa 44: os 5 KPIs do topo passam ao padrão visual da casa
 * (`ContactKpiCard`) — card 88px, tile 44px com `bg-kpi-*`, ícone 20px,
 * valor 26/700 tabular, rótulo 13/500 — e o grid ganha o breakpoint de 3.
 * O jsdom não tem layout, então o que se prova aqui é o contrato de classes
 * (o mesmo que o gate visual `kpiCard=88±4` mede no navegador).
 */
describe('TasksModule — etapa 44 (KPIs no padrão ContactKpiCard)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
  });

  /** 1 atrasada · 1 para hoje · 2 fazendo · 1 concluída hoje. */
  function renderComKpis() {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    setSelectResult({
      data: [
        makeTaskRow({ id: 'o1', status: 'todo', due_date: ontem }),
        makeTaskRow({ id: 'h1', status: 'todo', due_date: new Date().toISOString() }),
        makeTaskRow({ id: 'f1', status: 'doing' }),
        makeTaskRow({ id: 'f2', status: 'doing' }),
        makeTaskRow({ id: 'd1', status: 'done', completed_at: new Date().toISOString() }),
      ],
      error: null,
    });
    return renderModule();
  }

  it('renderiza 5 cards de 88px, cada um com tile de 44px', async () => {
    renderComKpis();
    await waitFor(() => expect(screen.getAllByTestId('kpi-card')).toHaveLength(5));

    for (const card of screen.getAllByTestId('kpi-card')) {
      expect(card.className).toContain('h-[88px]');
      expect(card.className).toContain('rounded-[14px]');
    }

    const tiles = screen.getAllByTestId('kpi-tile');
    expect(tiles).toHaveLength(5);
    for (const tile of tiles) expect(tile.className).toContain('h-11 w-11');

    // valor 700 + tabular (o tamanho fica no token da escala: text-2xl)
    for (const valor of screen.getAllByTestId('kpi-value')) {
      expect(valor.className).toContain('font-bold');
      expect(valor.className).toContain('tabular-nums');
      expect(valor.className).toContain('text-2xl');
    }
  });

  it('pinta os tiles por tipo e mostra o WIP "n/3" no Fazendo', async () => {
    renderComKpis();
    // os 5 cards existem desde o primeiro render (vazio): espera os numeros
    // reais chegarem antes de olhar as cores
    const strip = within(screen.getByTestId('tasks-kpi-strip'));
    await waitFor(() => expect(strip.getByText('Fazendo').closest('[data-testid="kpi-card"]')
      ?.querySelector('[data-testid="kpi-value"]')?.textContent).toBe('2/3'));

    const tileDe = (label: string) =>
      strip.getByText(label).closest('[data-testid="kpi-card"]')
        ?.querySelector('[data-testid="kpi-tile"]')?.className ?? '';
    const valorDe = (label: string) =>
      strip.getByText(label).closest('[data-testid="kpi-card"]')
        ?.querySelector('[data-testid="kpi-value"]')?.textContent ?? '';

    // com 1 atrasada o tile vira o de alerta; sem atrasadas seria o amarelo
    expect(tileDe('Atrasadas')).toContain('bg-destructive/15');
    expect(tileDe('Para hoje')).toContain('bg-kpi-blue');
    expect(tileDe('Fazendo')).toContain('bg-kpi-purple');
    expect(tileDe('Concluídas (7d)')).toContain('bg-kpi-green');
    expect(tileDe('Tempo médio')).toContain('bg-muted');

    expect(valorDe('Fazendo')).toBe('2/3');
    expect(valorDe('Atrasadas')).toBe('1');
    expect(valorDe('Para hoje')).toBe('1');
    expect(valorDe('Concluídas (7d)')).toBe('1');
  });

  it('o grid tem os 3 breakpoints (2 / 3 / 5 colunas)', async () => {
    renderComKpis();
    await waitFor(() => expect(screen.getAllByTestId('kpi-card')).toHaveLength(5));

    const grid = screen.getByTestId('tasks-kpi-strip').className;
    expect(grid).toContain('grid-cols-2');
    expect(grid).toContain('md:grid-cols-3');
    expect(grid).toContain('xl:grid-cols-5');
  });
});
