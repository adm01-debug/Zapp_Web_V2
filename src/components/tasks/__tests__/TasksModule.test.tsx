/**
 * B13 (etapa 20): trocar Lista <-> Quadro <-> Agenda NAO gera request.
 *
 * Antes o `TasksModule` passava `{ includeDone: mode === 'board' }` para o hook,
 * o que mudava a query key e refazia a busca a cada troca de modo. Agora existe
 * uma unica query e a contagem de `select` no cliente Supabase prova isso.
 *
 * O mock vem de `@/test/mocks/tarefas` (mesmo harness do teste do hook).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
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
describe('TasksModule — etapa 57 (QuickAdd da Agenda)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    setSelectResult({ data: [makeTaskRow()], error: null });
  });

  it('na Agenda existe um único QuickAdd, já apontando para o dia selecionado', async () => {
    renderModule({ defaultMode: 'agenda', forceMode: true });

    // espera sair do esqueleto (a Agenda só monta o QuickAdd com o dia na tela)
    await screen.findAllByTestId('agenda-day-dots');

    expect(screen.getAllByTestId('quick-add')).toHaveLength(1);
    expect(screen.getByTestId('quick-add-input').getAttribute('placeholder')).toContain('Adicionar em');
  });
});

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
    // a coluna vazia do Quadro entra no lugar (etapa 46); Fase F: asserção EXATA —
    // 4 das 5 colunas ficam vazias (backlog, fazendo, aguardando e concluído)
    expect(screen.getAllByText('Coluna vazia')).toHaveLength(4);
    expect(window.location.search).toContain('done=0');

    fireEvent.click(screen.getByRole('button', { name: /Limpar/ }));

    await waitFor(() => expect(screen.getByText('Feita')).toBeTruthy());
    expect(window.location.search).toBe('');
  });

  it('Fase F: a Lista esvaziada por um filtro QUE NÃO É A BUSCA oferece "Limpar filtros"', async () => {
    // Antes: só a busca decidia o vazio — com prioridade/contato/alarme a Lista
    // dizia "Adicione a primeira tarefa" e não oferecia como desfazer.
    window.history.replaceState(null, '', '/?prio=urgent');
    renderModule({ defaultMode: 'list' });

    expect(await screen.findByText('Nenhuma tarefa com esse filtro')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeTruthy();
  });

  it('Fase F: o cabeçalho conta a lista REAL, não o recorte do filtro', async () => {
    window.history.replaceState(null, '', '/?q=zzz');
    renderModule({ defaultMode: 'board' });

    // O recorte zera a tela, mas "1 aberta" (a tarefa real) segue no cabeçalho.
    expect((await screen.findAllByText(/1 aberta/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/0 abertas/)).toBeNull();
  });

  it('a busca anda no campo na hora e vira filtro depois do debounce, já na URL', async () => {
    renderModule({ defaultMode: 'board' });
    expect(await screen.findByText('Ligar')).toBeTruthy();

    const campo = screen.getByRole('searchbox', { name: 'Buscar tarefa' });
    fireEvent.change(campo, { target: { value: 'liga' } });

    // o valor do campo é imediato; o recorte (e a URL) vêm com o debounce
    expect((campo as HTMLInputElement).value).toBe('liga');
    await waitFor(() => expect(screen.queryByText('Feita')).toBeNull());
    // A URL acompanha o valor DEBOUNCED, mas quem a escreve é um `useEffect` do
    // hook que roda DEPOIS do commit que recorta a lista. Esperar só pela lista
    // deixava esta asserção correndo contra aquele efeito: sob carga (suíte
    // completa) o `waitFor` resolvia no intervalo em que o DOM já recortou e a
    // URL ainda estava vazia — `expected '' to contain 'q=liga'`, ~10% das vezes.
    // Esperar pela URL é o que a asserção realmente quer provar.
    await waitFor(() => expect(window.location.search).toContain('q=liga'));
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
    // `timeout` explícito: sob a suíte completa o primeiro render da carga
    // (mock resolve + lista monta) passa de 1s com alguma frequência, e o
    // `waitFor` padrão falhava aqui (`Unable to find the text: 'Ligar para o
    // cliente'`) derrubando o job de Unit Tests de PRs alheios.
    await waitFor(() => expect(h.select).toHaveBeenCalledTimes(1), { timeout: 4000 });
    await waitFor(() => expect(screen.getByText('Ligar para o cliente')).toBeTruthy(), { timeout: 4000 });

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

/**
 * Etapas 77/78 — o módulo não instala mais listener de teclado: o registry
 * global (escopo `tasks`/`pipeline`, com guarda de input) é quem decide e avisa
 * pelo evento `tasks-shortcut`. Estes testes exercitam a segunda metade do
 * caminho — o que o módulo faz com cada comando — e a região viva que narra
 * criar, concluir, mover e desfazer.
 */
describe('TasksModule — etapas 77/78 (atalhos do registry + aria-live)', () => {
  beforeEach(() => {
    cleanup();
    resetSupabaseMock();
    localStorage.clear();
    window.history.replaceState(null, '', '/?view=tasks');
  });
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    cleanup();
  });

  /** O registry avisa o módulo por este evento (ver useGlobalKeyboardShortcuts). */
  function comandar(id: string, key?: string) {
    act(() => {
      document.dispatchEvent(new CustomEvent('tasks-shortcut', { detail: { id, key } }));
    });
  }

  const regiaoViva = () => screen.getByTestId('tasks-live');

  it('monta a região viva: sr-only, role=status, aria-live=polite', async () => {
    setSelectResult({ data: [makeTaskRow()], error: null });
    renderModule();
    await screen.findByTestId('work-item-card');

    const regiao = regiaoViva();
    expect(regiao.getAttribute('aria-live')).toBe('polite');
    expect(regiao.getAttribute('role')).toBe('status');
    expect(regiao.getAttribute('aria-atomic')).toBe('true');
    expect(regiao.className).toContain('sr-only');
    expect(regiao.textContent).toBe('');
  });

  it('N foca o QuickAdd', async () => {
    setSelectResult({ data: [makeTaskRow()], error: null });
    renderModule();
    await screen.findByTestId('work-item-card');

    comandar('tasks-focus-quickadd');

    expect(document.activeElement).toBe(screen.getByTestId('quick-add-input'));
  });

  it('o atalho único de modo responde a 1, 2 e 3', async () => {
    setSelectResult({ data: [makeTaskRow()], error: null });
    renderModule();
    await screen.findByTestId('work-item-card');

    comandar('tasks-mode', '2');
    await waitFor(() => expect(modoAtual()).toBe('board'));
    comandar('tasks-mode', '3');
    await waitFor(() => expect(modoAtual()).toBe('agenda'));
    comandar('tasks-mode', '1');
    await waitFor(() => expect(modoAtual()).toBe('list'));
  });

  it('/ leva o foco para a busca', async () => {
    setSelectResult({ data: [makeTaskRow()], error: null });
    renderModule();
    await screen.findByTestId('work-item-card');

    comandar('tasks-search');

    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Buscar tarefa' }));
  });

  it('E abre o Sheet da tarefa em foco', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1', title: 'Ligar para o cliente' })], error: null });
    renderModule();
    const card = await screen.findByTestId('work-item-card');
    card.focus();

    comandar('tasks-open-sheet');

    expect(await screen.findByTestId('work-item-sheet')).toBeTruthy();
  });

  it('sem card em foco, E/X/Delete não fazem nada (e não anunciam)', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1' })], error: null });
    renderModule();
    await screen.findByTestId('work-item-card');

    (document.activeElement as HTMLElement | null)?.blur?.();
    comandar('tasks-open-sheet');
    comandar('tasks-complete');
    comandar('tasks-cancel');

    expect(screen.queryByTestId('work-item-sheet')).toBeNull();
    expect(regiaoViva().textContent).toBe('');
  });

  it('X conclui a tarefa em foco e anuncia "Concluída"', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1', title: 'Ligar', status: 'todo' })], error: null });
    renderModule();
    const card = await screen.findByTestId('work-item-card');
    card.focus();

    comandar('tasks-complete');

    await waitFor(() => expect(regiaoViva().textContent).toContain('Concluída'));
    expect(h.update).toHaveBeenCalled();
  });

  it('Delete cancela a tarefa em foco com desfazer', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1', title: 'Ligar', status: 'todo' })], error: null });
    renderModule();
    const card = await screen.findByTestId('work-item-card');
    card.focus();

    comandar('tasks-cancel');

    await waitFor(() => expect(h.undoToast).toHaveBeenCalled());
  });

  it('criar pelo QuickAdd anuncia "Tarefa criada"', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1' })], error: null });
    renderModule();
    await screen.findByTestId('work-item-card');

    const campo = screen.getByTestId('quick-add-input');
    fireEvent.change(campo, { target: { value: 'Comprar café' } });
    fireEvent.keyDown(campo, { key: 'Enter' });

    await waitFor(() => expect(regiaoViva().textContent).toContain('Tarefa criada'));
  });

  it('mover pelo kebab anuncia "Movida para {coluna} (n de limite)"', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1', title: 'Ligar', status: 'todo' })], error: null });
    renderModule();
    await screen.findByTestId('work-item-card');

    fireEvent.keyDown(await screen.findByLabelText('Mais opções'), { key: 'Enter', code: 'Enter' });
    const mover = await screen.findByRole('menuitem', { name: /Mover para/ });
    mover.focus();
    fireEvent.keyDown(mover, { key: 'ArrowRight', code: 'ArrowRight' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Fazendo/ }));

    await waitFor(() => expect(regiaoViva().textContent).toContain('Movida para Fazendo (1 de 3)'));
  });

  it('o Quadro publica as instruções de arrasto em pt-BR e marca o card', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1' })], error: null });
    renderModule({ defaultMode: 'board', forceMode: true });
    const card = await screen.findByTestId('work-item-card');

    // `dragHandleUsageInstructions` do DragDropContext vira um texto oculto no body.
    await waitFor(() => expect(document.body.textContent)
      .toContain('Pressione espaço para pegar a tarefa'));
    expect(card.getAttribute('aria-roledescription')).toBe('tarefa arrastável');
    expect(card.getAttribute('data-item-id')).toBe('t1');
  });

  it('fora do Quadro o card não se diz arrastável (não é alça de arrasto)', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 't1' })], error: null });
    renderModule();
    const card = await screen.findByTestId('work-item-card');

    expect(card.getAttribute('aria-roledescription')).toBeNull();
    expect(card.getAttribute('data-item-id')).toBe('t1');
  });

  it('reabrir anuncia "Desfeito"', async () => {
    // No Quadro a tarefa concluída fica na coluna Concluído (na Lista a seção
    // "Concluídas (7 dias)" nasce fechada — o card só existe depois do clique).
    setSelectResult({ data: [makeTaskRow({ id: 't1', title: 'Ligar', status: 'done', completed_at: new Date().toISOString() })], error: null });
    renderModule({ defaultMode: 'board', forceMode: true });
    const card = await screen.findByTestId('work-item-card');
    card.focus();

    comandar('tasks-complete');

    await waitFor(() => expect(regiaoViva().textContent).toContain('Desfeito'));
  });
});

/**
 * Etapa 86 — o contrato de entrada do módulo fechado de ponta a ponta: qual modo
 * a rota abre (`defaultMode` × preferência salva × `forceMode` de `?view=pipeline`),
 * o deep-link `?task=` convivendo com esse modo, e o atalho `N` alcançando o
 * QuickAdd do dia na Agenda (o registro do registry só chega como evento).
 */
describe('TasksModule — etapa 86 (modo padrão, deep-link e atalho N)', () => {
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

  it('sem preferência salva, o defaultMode da rota decide o modo (Agenda) e não é gravado', async () => {
    renderModule({ defaultMode: 'agenda' });

    await waitFor(() => expect(modoAtual()).toBe('agenda'));
    // entrar pela rota não reescreve a preferência do usuário
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBeNull();
  });

  it('com preferência salva, o defaultMode NÃO vence (retoma o modo salvo)', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'board');

    renderModule({ defaultMode: 'agenda' });

    await waitFor(() => expect(modoAtual()).toBe('board'));
  });

  it('`?view=pipeline` força o Quadro sobre a preferência salva e não a reescreve', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'list');

    renderModule(TASKS_ROUTE_PROPS.pipeline);

    await waitFor(() => expect(modoAtual()).toBe('board'));
    // visitar a rota não altera a preferência do usuário
    expect(localStorage.getItem(MODE_STORAGE_KEY)).toBe('list');
  });

  it('o deep-link `?task=` abre o Sheet sobre o Quadro forçado por `?view=pipeline`', async () => {
    localStorage.setItem(MODE_STORAGE_KEY, 'agenda');
    window.history.replaceState(null, '', '/?view=pipeline&task=t1');

    renderModule(TASKS_ROUTE_PROPS.pipeline);

    await waitFor(() => expect(modoAtual()).toBe('board'));
    const titulo = await screen.findByTestId('sheet-titulo');
    expect((titulo as HTMLInputElement).value).toBe('Ligar para o cliente');
    // a URL segue carregando o id do item aberto
    expect(new URLSearchParams(window.location.search).get('task')).toBe('t1');
  });

  it('`?task=` com um id fora da carga não abre o Sheet', async () => {
    window.history.replaceState(null, '', '/?task=nao-existe');

    renderModule();
    await screen.findByTestId('work-item-card');

    expect(screen.queryByTestId('work-item-sheet')).toBeNull();
  });

  it('o atalho N na Agenda leva o foco ao QuickAdd do dia (único da tela)', async () => {
    renderModule({ defaultMode: 'agenda', forceMode: true });
    await screen.findAllByTestId('agenda-day-dots');

    act(() => {
      document.dispatchEvent(new CustomEvent('tasks-shortcut', { detail: { id: 'tasks-focus-quickadd' } }));
    });

    expect(screen.getAllByTestId('quick-add')).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByTestId('quick-add-input'));
  });
});
