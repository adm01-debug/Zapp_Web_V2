import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import {
  supabaseMock as h, makeQueryClient, makeTaskRow, makeWrapper, resetSupabaseMock, setSelectResult,
} from '@/test/mocks/tarefas';
import { TasksModule } from '@/components/tasks/TasksModule';
import { TasksListMode } from '@/components/tasks/list/TasksListMode';
import { TooltipProvider } from '@/components/ui/tooltip';
import { bucketByDue } from '@/hooks/tasks/workItemAggregates';
import type { TaskMode } from '@/components/tasks/shared/ModeSwitcher';

void h;

function renderModule(props: { defaultMode?: TaskMode; forceMode?: boolean } = {}) {
  const qc = makeQueryClient();
  const Wrapper = makeWrapper(qc);
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <Wrapper><TasksModule {...props} /></Wrapper>
      </TooltipProvider>
    </MemoryRouter>
  );
}

function kpiValor(label: string): string {
  const strip = within(screen.getByTestId('tasks-kpi-strip'));
  const card = strip.getByText(label).closest('[data-testid="kpi-card"]');
  return card?.querySelector('[data-testid="kpi-value"]')?.textContent ?? '<sem card>';
}
function subtitulo(): string {
  return screen.getByText(/aberta/).textContent ?? '';
}
function corpo(): string {
  return (document.querySelector('[data-testid="tasks-module"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
}
function colunaComLabel(label: string): HTMLElement {
  for (const el of screen.getAllByText(label)) {
    let n: HTMLElement | null = el as HTMLElement;
    while (n && !String(n.className ?? '').includes('min-w-[232px]')) n = n.parentElement;
    if (n) return n;
  }
  throw new Error('coluna nao encontrada: ' + label);
}

const AGO = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const HOJE = () => new Date().toISOString();

describe('A2 - contagens reais x filtradas na MESMA tela', () => {
  beforeEach(() => { cleanup(); resetSupabaseMock(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

  it('A2-10 Lista: subtitulo real convive com KPI filtrado zerado', async () => {
    window.history.replaceState(null, '', '/?prio=high');
    setSelectResult({ data: [
      makeTaskRow({ id: 'm1', status: 'doing', priority: 'urgent', title: 'Fazendo urgente' }),
      makeTaskRow({ id: 'm2', status: 'doing', priority: 'medium', title: 'Fazendo media 1' }),
      makeTaskRow({ id: 'm3', status: 'doing', priority: 'medium', title: 'Fazendo media 2' }),
      makeTaskRow({ id: 'm4', status: 'todo', priority: 'medium', due_date: HOJE(), title: 'Prazo hoje 1' }),
      makeTaskRow({ id: 'm5', status: 'todo', priority: 'medium', due_date: HOJE(), title: 'Prazo hoje 2' }),
      makeTaskRow({ id: 'm6', status: 'todo', priority: 'medium', due_date: HOJE(), title: 'Prazo hoje 3' }),
    ], error: null });
    renderModule({ defaultMode: 'list' });
    await screen.findByText('Nenhuma tarefa com esse filtro');
    console.log('[A2-10] subtitulo="' + subtitulo() + '" | KPI Atrasadas=' + kpiValor('Atrasadas')
      + ' KPI Para hoje=' + kpiValor('Para hoje') + ' KPI Fazendo=' + kpiValor('Fazendo')
      + ' KPI Concluidas7d=' + kpiValor('Concluídas (7d)') + ' | corpo da Lista="'
      + screen.getByText('Nenhuma tarefa com esse filtro').textContent + '"');
    expect(subtitulo()).toContain('6 abertas');
    expect(subtitulo()).toContain('3 para hoje');
    expect(kpiValor('Para hoje')).toBe('0');
    expect(kpiValor('Fazendo')).toBe('3/3');
  });

  it('A2-11 Quadro: coluna Fazendo com 1 card e cabecalho da MESMA coluna dizendo 3/3', async () => {
    window.history.replaceState(null, '', '/?prio=urgent');
    setSelectResult({ data: [
      makeTaskRow({ id: 'm1', status: 'doing', priority: 'urgent', title: 'Fazendo urgente' }),
      makeTaskRow({ id: 'm2', status: 'doing', priority: 'medium', title: 'Fazendo media 1' }),
      makeTaskRow({ id: 'm3', status: 'doing', priority: 'medium', title: 'Fazendo media 2' }),
      makeTaskRow({ id: 't1', status: 'todo', priority: 'medium', title: 'A fazer qualquer' }),
    ], error: null });
    renderModule({ defaultMode: 'board' });
    await screen.findByText('Fazendo urgente');
    const col = colunaComLabel('Fazendo');
    const cards = within(col).queryAllByTestId('work-item-card').length;
    const header = col.firstElementChild as HTMLElement;
    console.log('[A2-11] subtitulo="' + subtitulo() + '" KPI Fazendo=' + kpiValor('Fazendo')
      + ' | coluna Fazendo: cards=' + cards + ' | texto do cabecalho da coluna="'
      + (header.textContent ?? '').replace(/\s+/g, ' ').trim() + '" | headerClassName="' + header.className + '"');
    expect(cards).toBe(1);
    expect((header.textContent ?? '').replace(/\s+/g, ' ').trim()).toContain('3/3');
  });

  it('A2-12 Quadro: aviso amarelo (soft) da coluna A fazer usa contagem FILTRADA', async () => {
    window.history.replaceState(null, '', '/?prio=urgent');
    setSelectResult({ data: [
      makeTaskRow({ id: 'u1', status: 'todo', priority: 'urgent', title: 'Unica urgente' }),
      ...Array.from({ length: 40 }, (_, i) => makeTaskRow({ id: 'n' + i, status: 'todo', priority: 'medium', title: 'Comum ' + i })),
    ], error: null });
    renderModule({ defaultMode: 'board' });
    await screen.findByText('Unica urgente');
    const col = colunaComLabel('A fazer');
    const header = col.firstElementChild as HTMLElement;
    console.log('[A2-12] subtitulo="' + subtitulo() + '" | header A fazer className="' + header.className
      + '" | cards visiveis na coluna=' + within(col).queryAllByTestId('work-item-card').length
      + ' | header text="' + (header.textContent ?? '').replace(/\s+/g, ' ').trim() + '"');
    expect(header.className).not.toContain('text-warning');
  });

  it('A2-13 Lista: mover para Fazendo e recusado (toast) com a tela sem nenhum card em Fazendo', async () => {
    window.history.replaceState(null, '', '/?prio=high');
    setSelectResult({ data: [
      makeTaskRow({ id: 'm1', status: 'doing', priority: 'urgent', title: 'Fazendo urgente' }),
      makeTaskRow({ id: 'm2', status: 'doing', priority: 'medium', title: 'Fazendo media 1' }),
      makeTaskRow({ id: 'm3', status: 'doing', priority: 'medium', title: 'Fazendo media 2' }),
      makeTaskRow({ id: 't1', status: 'todo', priority: 'high', title: 'Alta a fazer' }),
    ], error: null });
    renderModule({ defaultMode: 'list' });
    await screen.findByText('Alta a fazer');
    console.log('[A2-13] antes do clique | KPI Fazendo=' + kpiValor('Fazendo') + ' subtitulo="' + subtitulo()
      + '" | cards visiveis na Lista=' + screen.getAllByTestId('work-item-card').length);
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));
    const item = await screen.findByRole('menuitem', { name: 'Fazendo' });
    fireEvent.click(item);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalled());
    const chamadas = h.toast.error.mock.calls.map(c => String(c[0]));
    console.log('[A2-13] toast.error chamado com: ' + JSON.stringify(chamadas)
      + ' | card continua na Lista? ' + (screen.queryByText('Alta a fazer') !== null)
      + ' | KPI Fazendo depois=' + kpiValor('Fazendo'));
    expect(chamadas.join(' ')).toContain('Limite de Fazendo atingido');
    expect(screen.queryByText('Alta a fazer')).not.toBeNull();
  });
});

describe('A2 - estados vazios', () => {
  beforeEach(() => { cleanup(); resetSupabaseMock(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

  it('A2-20 Lista vazia SEM filtro: qual acao o vazio oferece?', async () => {
    setSelectResult({ data: [], error: null });
    renderModule({ defaultMode: 'list' });
    await screen.findByText('Adicione a primeira tarefa acima.');
    const botoes = screen.getAllByRole('button').map(b => (b.textContent ?? '').trim()).filter(Boolean);
    console.log('[A2-20] vazio sem filtro | botoes na tela=' + JSON.stringify(botoes)
      + ' | tem botao "Nova tarefa"? ' + (screen.queryByRole('button', { name: 'Nova tarefa' }) !== null)
      + ' | corpo="' + corpo() + '"');
    expect(screen.queryByRole('button', { name: 'Nova tarefa' })).toBeNull();
  });

  it('A2-21 Lista vazia COM filtro: oferece Limpar filtros', async () => {
    window.history.replaceState(null, '', '/?prio=urgent');
    setSelectResult({ data: [makeTaskRow({ id: 'a', status: 'todo', priority: 'medium' })], error: null });
    renderModule({ defaultMode: 'list' });
    await screen.findByText('Nenhuma tarefa com esse filtro');
    console.log('[A2-21] vazio com filtro | texto="'
      + screen.getByText('Nenhuma tarefa com esse filtro').textContent + '" + botao "'
      + screen.getByRole('button', { name: 'Limpar filtros' }).textContent + '"');
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeTruthy();
  });

  it('A2-22 Quadro sem item nenhum: contagem exata de Coluna vazia', async () => {
    setSelectResult({ data: [], error: null });
    renderModule({ defaultMode: 'board' });
    await screen.findByText('A fazer');
    await waitFor(() => expect(screen.getAllByText('Coluna vazia')).toHaveLength(5));
    console.log('[A2-22] "Coluna vazia" x' + screen.getAllByText('Coluna vazia').length
      + ' | labels de coluna presentes=' + JSON.stringify(['Caixa de entrada', 'A fazer', 'Fazendo', 'Aguardando', 'Concluido']
        .filter(l => screen.queryAllByText(l).length > 0)));
    expect(screen.getAllByText('Coluna vazia')).toHaveLength(5);
  });
});

describe('A2 - concluidas antigas no Quadro', () => {
  beforeEach(() => { cleanup(); resetSupabaseMock(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

  it('A2-30 coluna Concluido so com itens de 8-30 dias: rodape sim, Coluna vazia nao, clique revela', async () => {
    setSelectResult({ data: [
      makeTaskRow({ id: 'o1', status: 'done', title: 'Feita ha 13 dias', completed_at: AGO(13) }),
      makeTaskRow({ id: 'o2', status: 'done', title: 'Feita ha 20 dias', completed_at: AGO(20) }),
      makeTaskRow({ id: 'o3', status: 'done', title: 'Feita ha 25 dias', completed_at: AGO(25) }),
    ], error: null });
    renderModule({ defaultMode: 'board' });
    await screen.findByText('Ver mais antigas (30 dias)');
    const col = colunaComLabel('Concluido');
    console.log('[A2-30] ANTES do clique | texto da coluna="' + (col.textContent ?? '').replace(/\s+/g, ' ').trim()
      + '" | "Coluna vazia" na coluna=' + within(col).queryAllByText('Coluna vazia').length
      + ' | cards visiveis=' + within(col).queryAllByTestId('work-item-card').length
      + ' | badge do cabecalho="' + ((col.firstElementChild?.textContent ?? '')).replace(/\s+/g, ' ').trim()
      + '" | "Coluna vazia" na tela=' + screen.getAllByText('Coluna vazia').length);
    fireEvent.click(screen.getByText('Ver mais antigas (30 dias)'));
    await screen.findByText('Feita ha 13 dias');
    console.log('[A2-30] DEPOIS do clique | cards=' + within(col).queryAllByTestId('work-item-card').length
      + ' | badge do cabecalho="' + ((col.firstElementChild?.textContent ?? '')).replace(/\s+/g, ' ').trim()
      + '" | cards na tela=' + screen.getAllByTestId('work-item-card').length);
    expect(within(col).queryAllByText('Coluna vazia').length).toBe(0);
    expect(screen.getAllByText('Coluna vazia')).toHaveLength(4);
  });

  it('A2-31 Lista com uma unica concluida de 44 dias: o que aparece', async () => {
    setSelectResult({ data: [makeTaskRow({ id: 'velha', status: 'done', title: 'Feita ha 44 dias', completed_at: AGO(44) })], error: null });
    renderModule({ defaultMode: 'list' });
    await screen.findByText('Adicione a primeira tarefa acima.', {}, { timeout: 4000 }).catch(() => null);
    console.log('[A2-31] subtitulo="' + subtitulo() + '" | corpo="' + corpo() + '"');
  });
});

describe('A2 - concluida sem carimbo na tela', () => {
  beforeEach(() => { cleanup(); resetSupabaseMock(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

  it('A2-40 done sem completed_at: entra na secao Concluidas (7 dias) e no KPI; some com done=0', async () => {
    setSelectResult({ data: [
      makeTaskRow({ id: 's1', status: 'done', title: 'Sem carimbo', completed_at: null }),
      makeTaskRow({ id: 's2', status: 'todo', title: 'Aberta', priority: 'medium' }),
    ], error: null });
    renderModule({ defaultMode: 'list' });
    await screen.findByText('Aberta');
    console.log('[A2-40] KPI Concluidas(7d)=' + kpiValor('Concluídas (7d)')
      + ' | "Sem carimbo" visivel com a secao recolhida? ' + (screen.queryByText('Sem carimbo') !== null)
      + ' | cabecalho da secao="' + (screen.queryByText('Concluídas (7 dias)')?.textContent ?? 'ausente') + '"');
    fireEvent.click(screen.getByText('Concluídas (7 dias)'));
    await screen.findByText('Sem carimbo');
    const card = screen.getByText('Sem carimbo').closest('[data-testid="work-item-card"]') as HTMLElement;
    console.log('[A2-40] card renderizado="' + (card.textContent ?? '').replace(/\s+/g, ' ').trim()
      + '" | aria-label="' + card.getAttribute('aria-label') + '"');
    fireEvent.click(screen.getByRole('switch', { name: 'Mostrar concluídas' }));
    await waitFor(() => expect(screen.queryByText('Sem carimbo')).toBeNull());
    console.log('[A2-40] com done=0 | "Sem carimbo" na tela? ' + (screen.queryByText('Sem carimbo') !== null)
      + ' | corpo="' + corpo() + '"');
  });

  it('A2-41 Lista: contador da secao Concluidas x rodape "ver mais (30 dias)"', async () => {
    setSelectResult({ data: [
      makeTaskRow({ id: 'r1', status: 'done', title: 'Feita ha 1 dia', completed_at: AGO(1) }),
      makeTaskRow({ id: 'o1', status: 'done', title: 'Feita ha 13 dias', completed_at: AGO(13) }),
      makeTaskRow({ id: 'o2', status: 'done', title: 'Feita ha 20 dias', completed_at: AGO(20) }),
    ], error: null });
    renderModule({ defaultMode: 'list' });
    await screen.findByText('Concluídas (7 dias)');
    fireEvent.click(screen.getByText('Concluídas (7 dias)'));
    await screen.findByText('Feita ha 1 dia');
    const cab = screen.getByText('Concluídas (7 dias)').closest('button') as HTMLElement;
    console.log('[A2-41] recolhida/aberta | cabecalho="' + (cab.textContent ?? '').replace(/\s+/g, ' ').trim()
      + '" | cards visiveis=' + screen.getAllByTestId('work-item-card').length
      + ' | tem rodape "ver mais (30 dias)"? ' + (screen.queryByText('ver mais (30 dias)') !== null));
    fireEvent.click(screen.getByText('ver mais (30 dias)'));
    await screen.findByText('Feita ha 13 dias');
    console.log('[A2-41] depois do "ver mais" | cabecalho="' + (cab.textContent ?? '').replace(/\s+/g, ' ').trim()
      + '" | cards visiveis=' + screen.getAllByTestId('work-item-card').length);
  });
});

describe('A2 - filtersActive ?? (searchQuery !== "")', () => {
  beforeEach(() => { cleanup(); resetSupabaseMock(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

  const propsBase = (over: Record<string, unknown>) => ({
    byDue: bucketByDue([], new Date()),
    isLoading: false,
    onOpen: vi.fn(), onToggleDone: vi.fn(), onMoveTo: vi.fn(), onDelete: vi.fn(),
    onClearFilter: vi.fn(),
    hasMounted: { current: true } as React.MutableRefObject<boolean>,
    ...over,
  });

  it('A2-50 compat: searchQuery sozinho ainda mostra o vazio de FILTRO', () => {
    render(<TasksListMode {...(propsBase({ searchQuery: 'zzz' }) as never)} />);
    const txt = document.body.textContent ?? '';
    console.log('[A2-50] searchQuery="zzz" sem filtersActive -> "'
      + (txt.includes('Nenhuma tarefa com esse filtro') ? 'Nenhuma tarefa com esse filtro' : txt.replace(/\s+/g, ' ').trim()) + '"');
    expect(screen.getByText('Nenhuma tarefa com esse filtro')).toBeTruthy();
  });

  it('A2-51 filtersActive=false vence o searchQuery', () => {
    render(<TasksListMode {...(propsBase({ searchQuery: 'zzz', filtersActive: false }) as never)} />);
    const txt = document.body.textContent ?? '';
    const temFiltro = txt.includes('Nenhuma tarefa com esse filtro');
    const temTudo = txt.includes('Adicione a primeira tarefa acima.');
    console.log('[A2-51] searchQuery="zzz" + filtersActive=false -> vazio de filtro? ' + temFiltro
      + ' | vazio de tudo? ' + temTudo + ' | texto="' + txt.replace(/\s+/g, ' ').trim() + '"');
    expect(temFiltro).toBe(false);
    expect(temTudo).toBe(true);
  });
});
