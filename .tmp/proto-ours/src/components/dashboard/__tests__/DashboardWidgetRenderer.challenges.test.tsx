import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardWidgetRenderer, type DashboardStats } from '../DashboardWidgetRenderer';
import type { DashboardWidget } from '@/hooks/analytics/useDashboardWidgets';
import type { Goal } from '@/hooks/analytics/useGoalsDashboard';

const mockUseGoalsDashboard = vi.fn();
vi.mock('@/hooks/analytics/useGoalsDashboard', () => ({
  useGoalsDashboard: () => mockUseGoalsDashboard(),
}));

vi.mock('@/components/leaderboard/Leaderboard', () => ({ Leaderboard: () => null }));
vi.mock('@/components/gamification/DemoAchievements', () => ({ DemoAchievements: () => null }));
vi.mock('@/components/gamification/TrainingMiniGames', () => ({ TrainingMiniGames: () => null }));
vi.mock('@/components/dashboard/AIStatsWidget', () => ({ AIStatsWidget: () => null }));

const widget = {
  id: 'challenges', title: 'Desafios do Dia', type: 'challenges',
  visible: true, order: 1, size: 'full', level: 2,
} as DashboardWidget;

function stats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    openConversations: 0,
    totalConversations: 0,
    avgResponseTime: null,
    onlineAgents: 0,
    totalAgents: 0,
    resolvedToday: 0,
    pendingConversations: 0,
    queuesStats: [],
    recentActivity: [],
    ...overrides,
  };
}

/** sentMessages = null simula o hook sem o dado de mensagens enviadas. */
function hookWith(sentMessages: number | null, isLoading = false) {
  return {
    goals: (sentMessages === null
      ? []
      : [{ id: 'messages-sent', current: sentMessages }]) as unknown as Goal[],
    isLoading,
    overallProgress: 0,
    completedGoals: 0,
    period: 'today',
    setPeriod: vi.fn(),
    configDialogOpen: false,
    setConfigDialogOpen: vi.fn(),
  };
}

describe('ChallengesWidget (Desafios do Dia)', () => {
  beforeEach(() => {
    mockUseGoalsDashboard.mockReset();
  });

  it('mesmo componente, dado diferente dá selo diferente (nada fixo na tela)', () => {
    mockUseGoalsDashboard.mockReturnValue(hookWith(12));
    const primeiro = render(<DashboardWidgetRenderer widget={widget} stats={stats({ totalConversations: 20, resolvedToday: 8, avgResponseTime: 90, pendingConversations: 2 })} />);
    expect(screen.getByText('3/4')).toBeInTheDocument();
    primeiro.unmount();

    mockUseGoalsDashboard.mockReturnValue(hookWith(0));
    render(<DashboardWidgetRenderer widget={widget} stats={stats({ totalConversations: 1, resolvedToday: 1, avgResponseTime: 400, pendingConversations: 5 })} />);
    expect(screen.getByText('0/4')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument(); // 5 pendências = 50% do caminho para zerar
  });

  it('selo e progresso saem do dado do dia e o XP inventado não aparece', () => {
    mockUseGoalsDashboard.mockReturnValue(hookWith(12));
    render(
      <DashboardWidgetRenderer
        widget={widget}
        stats={stats({ totalConversations: 20, resolvedToday: 8, avgResponseTime: 90, pendingConversations: 2 })}
      />,
    );

    // 3 desafios concluídos de 4 (pendências = 2) — o selo é calculado, não fixo
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('12 de 10')).toBeInTheDocument();
    expect(screen.getByText('8 de 5')).toBeInTheDocument();
    expect(screen.getByText('2 de 0')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.queryByText(/XP/i)).not.toBeInTheDocument();
  });

  it('sem atividade no dia e sem dado do hook, mostra "Sem dados hoje" e nenhum selo', () => {
    mockUseGoalsDashboard.mockReturnValue(hookWith(null));
    render(<DashboardWidgetRenderer widget={widget} stats={stats()} />);

    expect(screen.getByTestId('challenges-sem-dados')).toBeInTheDocument();
    expect(screen.getByText('Sem dados hoje')).toBeInTheDocument();
    expect(screen.queryByText(/^\d\/\d$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/XP/i)).not.toBeInTheDocument();
  });

  it('todos os desafios concluídos mostra 4/4 e 100% em cada um', () => {
    mockUseGoalsDashboard.mockReturnValue(hookWith(10));
    render(
      <DashboardWidgetRenderer
        widget={widget}
        stats={stats({ totalConversations: 3, resolvedToday: 5, avgResponseTime: 180, pendingConversations: 0 })}
      />,
    );

    expect(screen.getByText('4/4')).toBeInTheDocument();
    expect(screen.getAllByText('100%')).toHaveLength(4);
  });

  it('só o desafio sem fonte de dado mostra "Sem dados hoje", o resto segue com número real', () => {
    // hook ainda carregando: mensagens enviadas não tem dado
    mockUseGoalsDashboard.mockReturnValue(hookWith(null, true));
    render(
      <DashboardWidgetRenderer
        widget={widget}
        stats={stats({ totalConversations: 9, resolvedToday: 2, avgResponseTime: 200, pendingConversations: 0 })}
      />,
    );

    expect(screen.queryByTestId('challenges-sem-dados')).not.toBeInTheDocument();
    expect(screen.getAllByText('Sem dados hoje')).toHaveLength(1);
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument(); // 180s de meta / 200s medidos
    expect(screen.getByText('2 de 5')).toBeInTheDocument();
  });
});
