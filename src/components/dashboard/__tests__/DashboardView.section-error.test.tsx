import type React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// Isolamento de falha por bloco: o bug é um widget que quebra derrubar a tela
// inteira. Aqui forçamos o gráfico de volume a lançar no render e conferimos
// que (a) o aviso aparece no lugar dele, (b) os outros blocos continuam de pé
// e (c) o erro é reportado com o nome da seção.
const reportClientError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/errorReporter', () => ({ reportClientError }));

const roleState = { isAdmin: true, isSupervisor: true };
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
vi.mock('../overview/DashboardHeader', () => ({
  DashboardHeader: ({ filters }: { filters: React.ReactNode }) => <div data-testid="stub-header">{filters}</div>,
}));
vi.mock('../overview/DashboardKpiRow', () => ({ DashboardKpiRow: () => <div data-testid="stub-kpi-row" /> }));
// O bloco que quebra: precisa expor o throw de verdade, sem disfarce.
vi.mock('../overview/VolumeChart', () => ({
  VolumeChart: () => {
    throw new Error('falha simulada no gráfico de volume');
  },
}));
vi.mock('../overview/NowPanel', () => ({ NowPanel: () => <div data-testid="stub-now-panel" /> }));
vi.mock('../overview/DailyGoalsCard', () => ({ DailyGoalsCard: () => <div data-testid="stub-daily-goals" /> }));
vi.mock('../overview/QueueHealthTable', () => ({ QueueHealthTable: () => <div data-testid="stub-queue-health" /> }));
vi.mock('../overview/RecentActivityCard', () => ({ RecentActivityCard: () => <div data-testid="stub-recent-activity" /> }));
vi.mock('../overview/TeamHighlightCard', () => ({ TeamHighlightCard: () => <div data-testid="stub-team-highlight" /> }));
vi.mock('../overview/AIToolsCard', () => ({ AIToolsCard: () => <div data-testid="stub-ai-tools" /> }));
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
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DashboardView />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DashboardView — isolamento de falha por bloco (SectionErrorBoundary)', () => {
  beforeEach(() => {
    reportClientError.mockClear();
    // O React reimprime o erro capturado no console; silencia para o log do teste.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('um bloco que lança erro vira aviso no lugar dele e os demais blocos continuam renderizados', () => {
    renderWithProviders();

    // O bloco quebrado mostra o aviso, não o conteúdo (o stub nunca monta).
    expect(screen.getByText(/Erro em "Gráfico de volume"/)).toBeInTheDocument();

    // Os blocos vizinhos continuam de pé (a tela inteira não cai).
    expect(screen.getByTestId('dash-kpis')).toBeInTheDocument();
    expect(screen.getByTestId('stub-kpi-row')).toBeInTheDocument();
    expect(screen.getByTestId('stub-now-panel')).toBeInTheDocument();
    expect(screen.getByTestId('dash-row3')).toBeInTheDocument();
    expect(screen.getByTestId('stub-recent-activity')).toBeInTheDocument();
    expect(screen.getByTestId('dash-row4')).toBeInTheDocument();
    expect(screen.getByTestId('stub-ai-tools')).toBeInTheDocument();
  });

  it('reporta o erro ao coletor de erros com o nome da seção que falhou', () => {
    renderWithProviders();

    expect(reportClientError).toHaveBeenCalledTimes(1);
    const [, context] = reportClientError.mock.calls[0];
    expect(context).toMatchObject({ source: 'SectionErrorBoundary', section: 'Gráfico de volume' });
    expect(reportClientError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
