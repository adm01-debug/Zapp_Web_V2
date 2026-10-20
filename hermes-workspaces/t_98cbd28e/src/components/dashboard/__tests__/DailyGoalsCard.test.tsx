import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailyGoalsCard } from '../overview/DailyGoalsCard';

const mockUseGoalsDashboard = vi.fn();
vi.mock('@/hooks/analytics/useGoalsDashboard', () => ({
  useGoalsDashboard: () => mockUseGoalsDashboard(),
}));

vi.mock('../GoalsConfigDialog', () => ({
  GoalsConfigDialog: () => null,
}));

function baseHook(overrides: Partial<ReturnType<typeof mockUseGoalsDashboard>> = {}) {
  return {
    goals: [],
    overallProgress: 0,
    completedGoals: 0,
    period: 'today',
    setPeriod: vi.fn(),
    configDialogOpen: false,
    setConfigDialogOpen: vi.fn(),
    ...overrides,
  };
}

describe('DailyGoalsCard', () => {
  it('com metas configuradas, mostra "Metas do Dia" e a lista real', () => {
    mockUseGoalsDashboard.mockReturnValue(baseHook({
      goals: [
        { id: '1', label: 'Responder 10 mensagens', description: '', target: 10, current: 10, unit: '', icon: () => null, color: '', priority: 'high' },
        { id: '2', label: 'Resolver 5 conversas', description: '', target: 5, current: 2, unit: '', icon: () => null, color: '', priority: 'medium' },
      ],
      overallProgress: 60,
      completedGoals: 1,
    }));
    render(<DailyGoalsCard onSeeAll={vi.fn()} stats={{ totalConversations: 0, resolvedToday: 0, avgResponseTime: null, pendingConversations: 0 }} />);
    expect(screen.getByText('Metas do Dia')).toBeInTheDocument();
    expect(screen.getByText('Responder 10 mensagens')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
  });

  it('0 metas mas com atividade real, cai no fallback "Desafios do Dia"', () => {
    mockUseGoalsDashboard.mockReturnValue(baseHook());
    render(<DailyGoalsCard onSeeAll={vi.fn()} stats={{ totalConversations: 12, resolvedToday: 3, avgResponseTime: 90, pendingConversations: 2 }} />);
    expect(screen.getByText('Desafios do Dia')).toBeInTheDocument();
    expect(screen.getByText('Responder 10 mensagens')).toBeInTheDocument();
  });

  it('0 metas e 0 atividade, mostra empty state "Configurar metas"', () => {
    mockUseGoalsDashboard.mockReturnValue(baseHook());
    render(<DailyGoalsCard onSeeAll={vi.fn()} stats={{ totalConversations: 0, resolvedToday: 0, avgResponseTime: null, pendingConversations: 0 }} />);
    expect(screen.getByText('Configurar metas')).toBeInTheDocument();
    expect(screen.queryByTestId('goals-donut')).not.toBeInTheDocument();
  });
});
