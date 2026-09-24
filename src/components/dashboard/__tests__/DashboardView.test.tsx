import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const roleState = { isAdmin: false, isSupervisor: false };
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => roleState }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

vi.mock('@/hooks/analytics/useDashboardData', () => ({
  useDashboardData: () => ({
    stats: { totalConversations: 0, resolvedToday: 0, avgResponseTime: 0, pendingConversations: 0 },
    contacts: [],
    queues: [],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/analytics/useRealtimeDashboard', () => ({
  useRealtimeDashboard: () => ({ isConnected: true, unreadMessages: 0 }),
}));
vi.mock('@/hooks/dashboard/useDashboardKpi', () => ({ useDashboardKpi: () => ({ data: undefined }) }));
vi.mock('@/hooks/dashboard/useQueueHealth', () => ({ useQueueHealth: () => ({ rows: [], busiestQueue: null }) }));
vi.mock('@/hooks/dashboard/useRecentConversationEvents', () => ({
  useRecentConversationEvents: () => ({ data: { items: [] } }),
}));
vi.mock('@/hooks/gamification/useLeaderboard', () => ({
  useLeaderboard: () => ({ agents: [], timeRange: 'month', setTimeRange: vi.fn() }),
}));
vi.mock('@/hooks/sla/useSLAMetrics', () => ({ useSLAMetrics: () => ({ data: { byAgent: [] } }) }));

// Paineis pesados: stub para isolar o teste na composicao/guard de navegacao
// de abas do proprio DashboardView, nao no comportamento interno de cada um.
vi.mock('../SLAMetricsDashboard', () => ({ SLAMetricsDashboard: () => <div data-testid="stub-sla" /> }));
vi.mock('../AIQuickAccess', () => ({ AIQuickAccess: () => <div data-testid="stub-ai-quick-access" /> }));
vi.mock('@/components/csat/CSATDashboard', () => ({ CSATDashboard: () => <div data-testid="stub-csat-dash" /> }));
vi.mock('../GoalsDashboard', () => ({ GoalsDashboard: () => <div data-testid="stub-goals" /> }));
vi.mock('../DemandPrediction', () => ({ DemandPrediction: () => <div data-testid="stub-demand" /> }));
vi.mock('../ActivityHeatmap', () => ({ ActivityHeatmap: () => <div data-testid="stub-activity-heatmap" /> }));
vi.mock('../ConversationHeatmap', () => ({ default: () => <div data-testid="stub-conv-heatmap" /> }));
vi.mock('../AgentPerformancePanel', () => ({ AgentPerformancePanel: () => <div data-testid="stub-agent-perf" /> }));
vi.mock('../SatisfactionMetrics', () => ({ SatisfactionMetrics: () => <div data-testid="stub-satisfaction" /> }));
vi.mock('../SentimentTrendChart', () => ({ SentimentTrendChart: () => <div data-testid="stub-sentiment-chart" /> }));
vi.mock('../ScheduledReportsManager', () => ({ ScheduledReportsManager: () => <div data-testid="stub-reports" /> }));
vi.mock('../overview/GreetingBanner', () => ({ GreetingBanner: () => <div data-testid="stub-greeting" /> }));
vi.mock('../overview/DashboardTopBar', () => ({ DashboardTopBar: () => <div data-testid="stub-topbar" /> }));
vi.mock('../overview/DashboardHeader', () => ({ DashboardHeader: ({ filters }: { filters: React.ReactNode }) => <div data-testid="stub-header">{filters}</div> }));
vi.mock('../overview/DashboardKpiRow', () => ({ DashboardKpiRow: () => <div data-testid="stub-kpi-row" /> }));
vi.mock('../overview/VolumeChart', () => ({ VolumeChart: () => <div data-testid="stub-volume" /> }));
vi.mock('../overview/NowPanel', () => ({ NowPanel: () => <div data-testid="stub-now-panel" /> }));
vi.mock('../overview/DailyGoalsCard', () => ({ DailyGoalsCard: () => <div data-testid="stub-daily-goals" /> }));
vi.mock('../overview/QueueHealthTable', () => ({
  QueueHealthTable: ({ onSeeAll }: { onSeeAll: () => void }) => <button onClick={onSeeAll}>ir para sla (staff)</button>,
}));
vi.mock('../overview/RecentActivityCard', () => ({ RecentActivityCard: () => <div data-testid="stub-recent-activity" /> }));
vi.mock('../overview/TeamHighlightCard', () => ({ TeamHighlightCard: () => <div data-testid="stub-team-highlight" /> }));
// AIToolsCard e o vetor do bug real: precisa expor o onSeeAll de verdade, sem
// disfarce, pra testar se DashboardView o liga num handler com guard de papel.
vi.mock('../overview/AIToolsCard', () => ({
  AIToolsCard: ({ onSeeAll }: { onSeeAll: () => void }) => <button onClick={onSeeAll}>Ver tudo (IA)</button>,
}));
vi.mock('../overview/CsatCard', () => ({ CsatCard: () => <div data-testid="stub-csat-card" /> }));
vi.mock('../overview/SentimentTrendCard', () => ({ SentimentTrendCard: () => <div data-testid="stub-sentiment-card" /> }));
vi.mock('../overview/GamificationSection', () => ({ GamificationSection: () => <div data-testid="stub-gamification" /> }));
vi.mock('../DashboardFilters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../DashboardFilters')>();
  return { ...actual, DashboardFilters: () => <div data-testid="stub-filters" /> };
});

import { DashboardView } from '../DashboardView';

function renderWithProviders() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><DashboardView /></QueryClientProvider>);
}

describe('DashboardView — guard de navegacao de abas (RBAC)', () => {
  beforeEach(() => {
    roleState.isAdmin = false;
    roleState.isSupervisor = false;
  });

  it('agente: barra de abas mostra so as 3 pessoais, nunca IA/SLA/Equipe/Sentimento/Relatorios', () => {
    renderWithProviders();
    const tabsBar = screen.getByTestId('dash-tabs');
    expect(tabsBar).toHaveTextContent('Visão Geral');
    expect(tabsBar).toHaveTextContent('Metas');
    expect(tabsBar).toHaveTextContent('Satisfação');
    expect(tabsBar).not.toHaveTextContent('Inteligência Artificial');
    expect(tabsBar).not.toHaveTextContent('Métricas SLA');
    expect(tabsBar).not.toHaveTextContent('Equipe');
    expect(tabsBar).not.toHaveTextContent('Relatórios');
  });

  it('agente: clicar em "Ver tudo" do card de IA NAO troca para a aba Inteligencia Artificial (regressao do bypass via setTab bruto)', () => {
    renderWithProviders();
    expect(screen.queryByTestId('stub-ai-quick-access')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo (IA)' }));
    expect(screen.queryByTestId('stub-ai-quick-access')).not.toBeInTheDocument();
  });

  it('staff (supervisor): o mesmo botao "Ver tudo" do card de IA troca de aba normalmente', () => {
    roleState.isSupervisor = true;
    renderWithProviders();
    expect(screen.queryByTestId('stub-ai-quick-access')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver tudo (IA)' }));
    expect(screen.getByTestId('stub-ai-quick-access')).toBeInTheDocument();
  });
});
