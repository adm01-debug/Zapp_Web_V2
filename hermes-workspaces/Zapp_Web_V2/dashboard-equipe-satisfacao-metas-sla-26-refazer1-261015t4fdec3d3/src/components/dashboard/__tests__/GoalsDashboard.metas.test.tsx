/**
 * `GoalsDashboard` — a tela de Metas nos estados que o cartão pede.
 *
 * O sujeito é a tela REAL com a tabela REAL (`goals/GoalsTable`): o estado vazio
 * ("Nenhuma meta ativa"), a contagem por faixa (Em risco / Em andamento /
 * Concluídas) e o recorte das abas Ativas/Concluídas. Ficam de fora a trilha
 * (`GoalsRail`, que consulta gamificação) e o diálogo de configuração — peças
 * irmãs, com teste próprio —, e a leitura `useGoalsDashboard` é dublada.
 *
 * O estado de carregando/erro da tela é outro cartão: `useGoalsDashboard` até
 * devolve `isLoading`, mas a tela não o usa e não há caminho de erro. Fica como
 * `it.todo`, junto do período (PL-08/PL-11).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MessageSquare, Users, CheckCircle2 } from 'lucide-react';

const h = vi.hoisted(() => ({ metas: vi.fn() }));

vi.mock('@/hooks/analytics/useGoalsDashboard', () => ({
  useGoalsDashboard: (...a: unknown[]) => h.metas(...a),
  getProgressColor: () => 'text-primary',
  getProgressBgColor: () => 'bg-primary',
}));
vi.mock('../goals/GoalsRail', () => ({ GoalsRail: () => <div data-testid="trilha" /> }));
vi.mock('../GoalsConfigDialog', () => ({
  GoalsConfigDialog: ({ open }: { open: boolean }) => <div data-testid="config-dialog" data-open={String(open)} />,
}));

import { GoalsDashboard } from '../GoalsDashboard';
import type { Goal } from '@/hooks/analytics/useGoalsDashboard';

function meta(over: Partial<Goal> & { id: string; label: string }): Goal {
  return {
    description: 'descrição',
    target: 100,
    current: 0,
    unit: 'itens',
    icon: MessageSquare,
    color: 'hsl(var(--primary))',
    priority: 'high',
    ...over,
  };
}

const CONCLUIDA = meta({ id: 'messages-sent', label: 'Mensagens Enviadas', target: 50, current: 60, unit: 'mensagens' });
const ATENCAO = meta({ id: 'contacts-handled', label: 'Contatos Atendidos', target: 10, current: 5, unit: 'contatos', icon: Users });
// 9/20 = 45%: abaixo das duas faixas de atenção — prende o corte do status
const RISCO = meta({ id: 'resolution-rate', label: 'Taxa de Resolução', target: 20, current: 9, unit: '%', icon: CheckCircle2, priority: 'medium' });

function resposta(over: Partial<ReturnType<typeof base>> = {}) {
  return { ...base(), ...over };
}

function base() {
  return {
    period: 'today',
    setPeriod: vi.fn(),
    configDialogOpen: false,
    setConfigDialogOpen: vi.fn(),
    showCelebration: false,
    setShowCelebration: vi.fn(),
    celebrationData: { title: '', subtitle: '', emoji: '🎉' },
    goals: [] as Goal[],
    overallProgress: 0,
    completedGoals: 0,
    isLoading: false,
    dateRange: { from: new Date(), to: new Date() },
  };
}

/** Valor do KPI pela posição (os quatro cards usam o mesmo testid). */
function kpi(i: number): string {
  return within(screen.getAllByTestId('kpi-card')[i]).getByTestId('kpi-value').textContent ?? '';
}

beforeEach(() => {
  h.metas.mockReset();
  h.metas.mockReturnValue(base());
});

describe('GoalsDashboard — sem metas', () => {
  it('não inventa progresso: tudo em zero e o convite para configurar', async () => {
    render(<GoalsDashboard />);

    expect(kpi(0)).toBe('0%');
    await waitFor(() => expect(kpi(1)).toBe('0'));
    await waitFor(() => expect(kpi(2)).toBe('0'));
    await waitFor(() => expect(kpi(3)).toBe('0'));
    expect(screen.getByText('0 de 0 metas em andamento')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma meta ativa')).toBeInTheDocument();
    expect(screen.getByText('de 0 metas')).toBeInTheDocument();
    expect(screen.getByText('Configurar metas')).toBeInTheDocument();
  });

  it('"Configurar metas" pede a abertura do diálogo', () => {
    const respostaSemMetas = resposta();
    h.metas.mockReturnValue(respostaSemMetas);
    render(<GoalsDashboard />);

    fireEvent.click(screen.getByText('Configurar metas'));

    expect(respostaSemMetas.setConfigDialogOpen).toHaveBeenCalledWith(true);
  });
});

describe('GoalsDashboard — metas com dado', () => {
  beforeEach(() => {
    h.metas.mockReturnValue(
      resposta({ goals: [CONCLUIDA, ATENCAO, RISCO], overallProgress: 65, completedGoals: 1 }),
    );
  });

  it('classifica cada meta na faixa certa e resume o painel', async () => {
    render(<GoalsDashboard />);

    expect(kpi(0)).toBe('65%');
    await waitFor(() => expect(kpi(1)).toBe('1'));
    await waitFor(() => expect(kpi(2)).toBe('1'));
    await waitFor(() => expect(kpi(3)).toBe('1'));
    expect(screen.getByText('2 de 3 metas em andamento')).toBeInTheDocument();

    const tabela = screen.getByTestId('goals-table-card');
    expect(within(tabela).getByText('Contatos Atendidos')).toBeInTheDocument();
    expect(within(tabela).getByText('Atenção')).toBeInTheDocument();
    expect(within(tabela).getByText('Taxa de Resolução')).toBeInTheDocument();
    expect(within(tabela).getByText('Em risco')).toBeInTheDocument();
    expect(within(tabela).getByText('50%')).toBeInTheDocument();
  });

  it('abre na aba Ativas e a Concluída só aparece na aba Concluídas', () => {
    render(<GoalsDashboard />);
    const tabela = screen.getByTestId('goals-table-card');
    expect(within(tabela).queryByText('Mensagens Enviadas')).not.toBeInTheDocument();
    expect(within(tabela).getByRole('button', { name: 'Ativas (2)' })).toBeInTheDocument();

    fireEvent.click(within(tabela).getByRole('button', { name: 'Concluídas (1)' }));

    expect(within(tabela).getByText('Mensagens Enviadas')).toBeInTheDocument();
    expect(within(tabela).getByText('100%')).toBeInTheDocument();
    expect(within(tabela).getByText('Em dia')).toBeInTheDocument();
    expect(within(tabela).queryByText('Contatos Atendidos')).not.toBeInTheDocument();
  });

  it('o botão de ações da linha também pede o diálogo de configuração', () => {
    const respostaComMetas = resposta({ goals: [CONCLUIDA, ATENCAO, RISCO], overallProgress: 65, completedGoals: 1 });
    h.metas.mockReturnValue(respostaComMetas);
    render(<GoalsDashboard />);

    fireEvent.click(within(screen.getByTestId('goals-table-card')).getAllByTitle('Configurar meta')[0]);

    expect(respostaComMetas.setConfigDialogOpen).toHaveBeenCalledWith(true);
  });
});

describe('GoalsDashboard — caminhos que dependem de outro cartão', () => {
  it.todo(
    'carregando/erro da leitura e seletor de período da tela de Metas: `useGoalsDashboard` devolve `isLoading` mas a tela não o usa e não há estado de erro (PL-08 taxa de resolução real, PL-11 fuso único)',
  );
});
