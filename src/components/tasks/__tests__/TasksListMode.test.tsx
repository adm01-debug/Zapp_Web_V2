/**
 * Etapa 86 — a Lista como unidade: as 6 seções na ordem do contrato, o
 * agrupamento por dia de "Próximas", a seção "Concluídas (7 dias)" (que recebe
 * `done7d` e nasce recolhida), os dois vazios (`all`/`filter`) e as portas de
 * interação do card (checkbox × clique, e o reabrir do item concluído).
 *
 * O componente só recebe props (não fala com o banco), então o teste renderiza
 * direto — sem mock de Supabase. O `TooltipProvider` é o mesmo contexto que a
 * app monta em `AppProviders` (o cabeçalho de "Próximas" usa `Tooltip`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TasksListMode } from '@/components/tasks/list/TasksListMode';
import type { BucketsByDue } from '@/hooks/tasks/workItemAggregates';
import type { WorkItem } from '@/hooks/tasks/workItem.types';
import { makeTaskRow } from '@/test/mocks/tarefas';

/** Item do domínio: reusa a fixture do banco (mesmo shape) sem duplicar dados. */
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

/** A `Section` lê `hasMounted` para decidir a animação de entrada. */
const temMontado = { current: true };

interface Opcoes {
  isLoading?: boolean;
  filtersActive?: boolean;
  searchQuery?: string;
  /** Etapa 043 (refazer 2): id recém-criado que entra na Caixa de entrada. */
  destaqueId?: string | null;
}

function renderLista(byDue: BucketsByDue, over: Opcoes = {}) {
  const acoes = {
    onOpen: vi.fn(),
    onToggleDone: vi.fn(),
    onMoveTo: vi.fn(),
    onDelete: vi.fn(),
    onClearFilter: vi.fn(),
  };
  const view = render(
    <TooltipProvider>
      <TasksListMode
        byDue={byDue}
        isLoading={over.isLoading ?? false}
        searchQuery={over.searchQuery ?? ''}
        filtersActive={over.filtersActive}
        destaqueId={over.destaqueId}
        hasMounted={temMontado}
        {...acoes}
      />
    </TooltipProvider>
  );
  return { ...view, ...acoes };
}

describe('TasksListMode — etapa 86 (seções, vazios e portas do card)', () => {
  beforeEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('renderiza as 6 seções na ordem contratada', () => {
    renderLista(buckets({
      overdue: [item({ id: 'o', title: 'Vencida' })],
      today: [item({ id: 'h', title: 'Do dia' })],
      tomorrow: [item({ id: 'a', title: 'De amanhã' })],
      upcoming: [item({ id: 'p', title: 'De depois' })],
      noDue: [item({ id: 's', title: 'Sem data' })],
      done7d: [item({ id: 'c', title: 'Concluída', status: 'done' })],
    }));

    // Os itens não têm prazo, então "Hoje"/"Amanhã" só podem ser o cabeçalho da seção.
    const cabecalhos = ['Atrasadas', 'Hoje', 'Amanhã', 'Próximas', 'Sem prazo', 'Concluídas (7 dias)']
      .map(titulo => screen.getByText(titulo));
    expect(cabecalhos).toHaveLength(6);

    for (let i = 1; i < cabecalhos.length; i++) {
      const posicao = cabecalhos[i - 1].compareDocumentPosition(cabecalhos[i]);
      expect(posicao & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('a seção "Concluídas (7 dias)" recebe done7d e nasce recolhida (abre no clique)', () => {
    renderLista(buckets({
      done7d: [item({ id: 'c', title: 'Feita ontem', status: 'done', completed_at: new Date().toISOString() })],
    }));

    // O cabeçalho está na tela, mas o item da semana ainda não (seção recolhida).
    expect(screen.getByText('Concluídas (7 dias)')).toBeTruthy();
    expect(screen.queryByText('Feita ontem')).toBeNull();

    fireEvent.click(screen.getByText('Concluídas (7 dias)'));

    expect(screen.getByText('Feita ontem')).toBeTruthy();
  });

  it('"Próximas" agrupa por dia: as duas do mesmo dia ficam sob um único subcabeçalho', () => {
    const mesmoDia = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const semanaQueVem = new Date(Date.now() + 10 * 86_400_000).toISOString();
    renderLista(buckets({
      upcoming: [
        item({ id: 'u1', title: 'Primeira do dia', due_date: mesmoDia }),
        item({ id: 'u2', title: 'Segunda do dia', due_date: mesmoDia }),
        item({ id: 'u3', title: 'Mais adiante', due_date: semanaQueVem }),
      ],
    }));

    expect(screen.getByText('Primeira do dia')).toBeTruthy();
    expect(screen.getByText('Segunda do dia')).toBeTruthy();

    // O rótulo do dia no subcabeçalho começa em maiúscula ("Qua 08/10"); o chip do
    // card usa a forma minúscula ("qua 08/10"), então esta regex isola o cabeçalho.
    expect(screen.getAllByText(/^[A-ZÀ-Ú][a-zà-ú]{2} \d{2}\/\d{2}$/)).toHaveLength(1);
    // O que passa de 7 dias cai no rótulo próprio (terceiro grupo, não o mesmo).
    expect(screen.getByText('Semana que vem')).toBeTruthy();
  });

  it('sem tarefa e sem filtro mostra o vazio "all" (com o atalho N)', () => {
    renderLista(buckets());

    expect(screen.getByText('Nada por aqui')).toBeTruthy();
    expect(screen.getByText('Adicione a primeira tarefa acima.')).toBeTruthy();
    expect(screen.queryByText('Nenhuma tarefa com esse filtro')).toBeNull();
  });

  it('com filtro ativo o vazio é o "filter" e "Limpar filtros" desfaz', () => {
    const { onClearFilter } = renderLista(buckets(), { filtersActive: true });

    expect(screen.getByText('Nenhum resultado')).toBeTruthy();
    expect(screen.queryByText('Nada por aqui')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(onClearFilter).toHaveBeenCalledTimes(1);
  });

  it('o checkbox conclui sem abrir o card (onToggleDone sem onOpen)', () => {
    const alvo = item({ id: 'k1', title: 'Concluir sem abrir' });
    const { onToggleDone, onOpen } = renderLista(buckets({ noDue: [alvo] }));

    const card = screen.getByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Concluir tarefa' }));

    expect(onToggleDone).toHaveBeenCalledWith(alvo);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('na seção "Concluídas" o checkbox é o de reabrir e desfaz pelo onToggleDone', () => {
    const feita = item({ id: 'c1', title: 'Já foi', status: 'done', completed_at: new Date().toISOString() });
    const { onToggleDone } = renderLista(buckets({ done7d: [feita] }));

    fireEvent.click(screen.getByText('Concluídas (7 dias)'));
    const card = screen.getByRole('article');
    fireEvent.click(within(card).getByRole('button', { name: 'Reabrir tarefa' }));

    expect(onToggleDone).toHaveBeenCalledWith(feita);
  });

  it('durante o carregamento mostra 6 esqueletos e nenhuma seção', () => {
    const { container } = renderLista(buckets(), { isLoading: true });

    expect(container.querySelectorAll('.animate-shimmer')).toHaveLength(6);
    expect(screen.queryByText('Nada por aqui')).toBeNull();
  });
});

/**
 * Etapa 043 (refazer 2) — criação otimista na captura: o item que acabou de
 * nascer entra pintado com o realce de 1,2 s. O `<TasksListMode>` só desenha o
 * realce quando o id recém-criado é o DESTE item (id de outro não vaza para cá);
 * quem conta os 1,2 s e limpa o id é o `TasksModule` (o teste de lá mede o tempo).
 */
describe('TasksListMode — etapa 043 (refazer 2): realce do item recém-criado', () => {
  beforeEach(cleanup);

  it('pinta só o item do id recém-criado', () => {
    const novo = item({ id: 'novo-1', title: 'Recém-criada' });
    const antigo = item({ id: 't1', title: 'Antiga' });

    renderLista(buckets({ noDue: [novo, antigo] }), { destaqueId: 'novo-1' });

    const realces = screen.getAllByTestId('work-item-realce');
    expect(realces).toHaveLength(1);
    // o realce fica na MESMA caixa do cartão novo (o invólucro da seção), coberto
    // pelo `pointer-events-none`, e não na do antigo
    const caixaNova = screen.getByText('Recém-criada').closest('[data-testid="work-item-card"]')?.parentElement;
    const caixaAntiga = screen.getByText('Antiga').closest('[data-testid="work-item-card"]')?.parentElement;
    expect(caixaNova?.contains(realces[0])).toBe(true);
    expect(caixaAntiga?.contains(realces[0])).toBe(false);

    cleanup();

    // Sem destaque (barra já limpa) e com o destaque de OUTRO id: nenhum realce.
    renderLista(buckets({ noDue: [novo, antigo] }));
    expect(screen.queryByTestId('work-item-realce')).toBeNull();
    cleanup();

    renderLista(buckets({ noDue: [novo, antigo] }), { destaqueId: 'inexistente' });
    expect(screen.queryByTestId('work-item-realce')).toBeNull();
  });
});
