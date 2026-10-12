/**
 * Etapas 065–067 e 070–072 — o comportamento NOVO da Lista em tabela.
 *
 * O que este arquivo prova (e que o desenho anterior não tinha):
 *   065 — cada grupo recolhe/abre, e a escolha do usuário é lembrada por navegador;
 *   066 — "Concluídas · últimos 7 dias", o "Ver até 30 dias >" no CABEÇALHO (o
 *         rodapé "ver mais (30 dias)" deixou de existir) e a linha riscada/muted;
 *   067 — o estado INICIAL: Atrasadas e Hoje abertos; Amanhã, Próximas, Sem prazo
 *         e Concluídas recolhidos (só o contador);
 *   070 — abaixo de 1024 px a tabela vira lista de cartões compactos;
 *   071 — o carregamento mostra o esqueleto da TABELA;
 *   072 — sem animação de altura em movimento reduzido.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksListMode } from '@/components/tasks/list/TasksListMode';
import { makeTaskRow } from '@/test/mocks/tarefas';
import type { WorkItem } from '@/hooks/tasks/workItem.types';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import { animacaoDaLinha, transicaoDaLinha } from '@/components/tasks/list/animacaoLinha';

function item(over: Record<string, unknown> = {}): WorkItem {
  return makeTaskRow(over) as unknown as WorkItem;
}

const vazio: WorkItem[] = [];
function buckets(over: Partial<BucketsByDue> = {}): BucketsByDue {
  return {
    overdue: vazio,
    today: vazio,
    tomorrow: vazio,
    upcoming: vazio,
    noDue: vazio,
    done7d: vazio,
    doneOlder: vazio,
    ...over,
  };
}

const refMounted = { current: true };

function renderLista(byDue: BucketsByDue, isLoading = false) {
  return render(
    <TooltipProvider>
      <TasksListMode
        byDue={byDue}
        isLoading={isLoading}
        searchQuery=""
        onOpen={vi.fn()}
        onToggleDone={vi.fn()}
        onMoveTo={vi.fn()}
        onDelete={vi.fn()}
        onClearFilter={vi.fn()}
        hasMounted={refMounted}
      />
    </TooltipProvider>
  );
}

/** Cabeçalho do grupo pelo título (é um <button>, o nó que recolhe/abre). */
function cabecalho(titulo: string) {
  return screen.getByRole('button', { name: (nome: string) => nome.startsWith(titulo) });
}

/** Troca o `matchMedia` do jsdom por um que responde o breakpoint da Lista (etapa 070). */
function mockMatchMedia(estreita: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    matches: estreita && q.includes('1023'),
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('065 — grupos recolhíveis com a escolha lembrada por navegador', () => {
  it('recolhe e abre no clique do cabeçalho, marcando aria-expanded', () => {
    renderLista(buckets({ noDue: [item({ id: 'n1', title: 'Sem prazo 1' })] }));

    // Etapa 067: "Sem prazo" nasce recolhido — o item não está montado.
    expect(cabecalho('Sem prazo').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Sem prazo 1')).toBeNull();

    fireEvent.click(cabecalho('Sem prazo'));
    expect(cabecalho('Sem prazo').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Sem prazo 1')).toBeTruthy();
  });

  it('guarda a escolha no localStorage e a respeita no próximo mount', () => {
    renderLista(buckets({ noDue: [item({ id: 'n1', title: 'Sem prazo 1' })] }));
    fireEvent.click(cabecalho('Sem prazo'));

    const salvo = JSON.parse(window.localStorage.getItem('tasks-list-groups') ?? '{}');
    expect(salvo['sem-prazo']).toBe(true);

    cleanup();
    renderLista(buckets({ noDue: [item({ id: 'n1', title: 'Sem prazo 1' })] }));
    // Sem clique: a preferência do usuário vence o padrão da etapa 067.
    expect(cabecalho('Sem prazo').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Sem prazo 1')).toBeTruthy();
  });
});

describe('066 — Concluídas: título, "Ver até 30 dias >" no cabeçalho e linha riscada', () => {
  it('o "Ver até 30 dias >" vive no cabeçalho do grupo (o rodapé acabou)', () => {
    renderLista(buckets({
      done7d: [item({ id: 'c', title: 'Feita ontem', status: 'done' })],
      doneOlder: [item({ id: 'd', title: 'Feita duas semanas', status: 'done' })],
    }));

    expect(screen.getByText('Concluídas · últimos 7 dias')).toBeTruthy();
    // O antigo rodapé "ver mais (30 dias)" não existe mais.
    expect(screen.queryByText(/ver mais \(30 dias\)/)).toBeNull();

    const verMais = screen.getByTestId('list-group-ver-mais');
    expect(verMais.textContent).toContain('Ver até 30 dias');
    // O cabeçalho do grupo hospeda o link (é o avô dele).
    expect(verMais.closest('[data-testid="list-group-row"]')).toBeTruthy();
    expect(verMais.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(verMais);
    expect(screen.getByText('Feita ontem')).toBeTruthy();
    expect(screen.getByText('Feita duas semanas')).toBeTruthy();
    expect(screen.getByText('Ver menos')).toBeTruthy();
  });

  it('a linha concluída sai riscada e em muted', () => {
    renderLista(buckets({ done7d: [item({ id: 'c', title: 'Feita ontem', status: 'done' })] }));
    fireEvent.click(cabecalho('Concluídas'));

    const titulo = screen.getByText('Feita ontem');
    expect(titulo.className).toContain('line-through');
    expect(titulo.className).toContain('text-muted-foreground');
  });
});

describe('067 — estado inicial dos grupos', () => {
  it('Atrasadas e Hoje abrem; Amanhã, Próximas, Sem prazo e Concluídas recolhem', () => {
    renderLista(buckets({
      overdue: [item({ id: 'o1', title: 'Atrasada' })],
      today: [item({ id: 'h1', title: 'De hoje' })],
      tomorrow: [item({ id: 'a1', title: 'De amanhã' })],
      upcoming: [item({ id: 'u1', title: 'De depois' })],
      noDue: [item({ id: 'n1', title: 'Sem prazo nenhum' })],
      done7d: [item({ id: 'c1', title: 'Concluída', status: 'done' })],
    }));

    expect(cabecalho('Atrasadas').getAttribute('aria-expanded')).toBe('true');
    expect(cabecalho('Hoje').getAttribute('aria-expanded')).toBe('true');
    expect(cabecalho('Amanhã').getAttribute('aria-expanded')).toBe('false');
    expect(cabecalho('Próximas').getAttribute('aria-expanded')).toBe('false');
    expect(cabecalho('Sem prazo').getAttribute('aria-expanded')).toBe('false');
    expect(cabecalho('Concluídas').getAttribute('aria-expanded')).toBe('false');

    // O que abre mostra os itens; o que recolhe mostra só o contador.
    expect(screen.getByText('Atrasada')).toBeTruthy();
    expect(screen.getByText('De hoje')).toBeTruthy();
    expect(screen.queryByText('De amanhã')).toBeNull();
    expect(screen.queryByText('Sem prazo nenhum')).toBeNull();
    expect(screen.queryByText('Concluída')).toBeNull();
  });
});

describe('070 — responsivo: abaixo de 1024 px vira lista de cartões compactos', () => {
  it('em viewport estreita troca a tabela por cartões (sem rolagem horizontal)', () => {
    const restaurar = mockMatchMedia(true);
    try {
      renderLista(buckets({ today: [item({ id: 'h1', title: 'De hoje' })] }));

      expect(screen.getByTestId('tasks-list-cards')).toBeTruthy();
      expect(screen.queryByTestId('tasks-list-table')).toBeNull();
      expect(screen.getAllByRole('article').length).toBeGreaterThan(0);
      expect(screen.getByText('De hoje')).toBeTruthy();
    } finally {
      restaurar();
    }
  });

  it('em viewport larga segue a tabela', () => {
    renderLista(buckets({ today: [item({ id: 'h1', title: 'De hoje' })] }));

    expect(screen.getByTestId('tasks-list-table')).toBeTruthy();
    expect(screen.queryByTestId('tasks-list-cards')).toBeNull();
  });
});

describe('071 — esqueleto da tabela no carregamento', () => {
  it('mostra 6 linhas de esqueleto, na grade da tabela, e nenhuma seção', () => {
    const { container } = renderLista(buckets(), true);

    expect(screen.getByTestId('tasks-list-skeleton')).toBeTruthy();
    expect(container.querySelectorAll('.animate-shimmer')).toHaveLength(6);
    expect(screen.queryAllByTestId('list-group-row')).toHaveLength(0);
    expect(screen.queryByTestId('tasks-list-table')).toBeNull();
  });
});

describe('072 — entrada escalonada (≤40 ms/linha) e altura desligada em movimento reduzido', () => {
  it('o atraso da entrada é de 40 ms por linha, limitado às 12 primeiras', () => {
    expect(transicaoDaLinha(false, 0)).toEqual({ duration: 0.15, delay: 0 });
    expect(transicaoDaLinha(false, 3)).toEqual({ duration: 0.15, delay: 0.12 });
    // Além da 12ª o atraso não cresce (0,48 s é o teto).
    expect(transicaoDaLinha(false, 99)).toEqual({ duration: 0.15, delay: 0.48 });
  });

  it('a linha normal anima altura na entrada e na saída', () => {
    const anim = animacaoDaLinha(false);
    expect(anim.animate.height).toBe('auto');
    expect(anim.exit.height).toBe(0);
  });

  it('em movimento reduzido não há altura animada nem atraso', () => {
    const anim = animacaoDaLinha(true);
    expect(anim.animate).not.toHaveProperty('height');
    expect(anim.exit).not.toHaveProperty('height');
    expect(anim.animate).not.toHaveProperty('y');
    expect(transicaoDaLinha(true, 5)).toEqual({ duration: 0 });
  });
});
