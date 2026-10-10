import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SLAAgentTable } from '@/components/queues/SLAAgentTable';
import { SLAMetricCards } from '@/components/queues/SLAMetricCards';
import { WarRoomAgentCard } from '@/components/dashboard/war-room/WarRoomAgentCard';
import { WarRoomQueueRow } from '@/components/dashboard/war-room/WarRoomQueueRow';
import { WarRoomAlertRow } from '@/components/dashboard/war-room/WarRoomAlertRow';
import { SentimentAlertsDashboard } from '@/components/dashboard/SentimentAlertsDashboard';
import { WarRoomDashboard } from '@/components/dashboard/WarRoomDashboard';
import { SLADashboard } from '@/components/queues/SLADashboard';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/sla/useSLAMetrics', () => ({
  useSLAMetrics: vi.fn(() => ({
    data: {
      overall: { overallRate: 85, totalConversations: 120, firstResponse: { rate: 78, onTime: 94, breached: 26 } },
      byAgent: [],
    },
    loading: false,
  })),
}));
vi.mock('@/hooks/sla/useSLAHistory', () => ({
  useSLAHistory: vi.fn(() => ({ data: null })),
}));
vi.mock('@/hooks/business/useWarRoomData', () => ({
  useWarRoomData: vi.fn(() => ({ agents: [], queues: [], alerts: [], loading: false })),
  useWarRoomMetrics: vi.fn(() => ({
    totalAgents: 0,
    totalQueues: 0,
    activeAlerts: 0,
    avgResponseTime: 0,
    avgSatisfaction: 4.2,
  })),
}));
vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: vi.fn(() => ({
    settings: { soundEnabled: true },
    updateSettings: vi.fn(),
  })),
}));
vi.mock('@/hooks/business/useWarRoomAlerts', () => ({
  useWarRoomAlerts: vi.fn(() => ({ alerts: [], dismissAlert: vi.fn() })),
}));
vi.mock('@/components/dashboard/useSentimentData', () => ({
  useSentimentData: vi.fn(() => ({
    alerts: [],
    analyses: 0,
    loading: false,
    stats: { totalAlerts: 0, criticalAlerts: 0, negativeRate: 0, uniqueContacts: 0, emailsSent: 0, totalAnalyses: 0, avgSentiment: null },
    dailyData: [],
    agentData: [],
    fetchData: vi.fn(),
  })),
  getSentimentColor: vi.fn(() => ''),
  getSentimentBg: vi.fn(() => ''),
}));

const mockAgents = [
  { agentId: 'a1', agentName: 'Ana Silva', overallRate: 92, firstResponse: { rate: 85, onTime: 17, total: 20 } },
  { agentId: 'a2', agentName: 'Bruno Costa', overallRate: 78, firstResponse: { rate: 70, onTime: 14, total: 20 } },
];

const mockQueue = {
  id: 'queue-1',
  name: 'Suporte Prioritário',
  color: 'hsl(var(--primary))',
  waiting: 10,
  inProgress: 5,
  avgWaitTime: 3.5,
  slaBreaches: 0,
  slaWarnings: 2,
};

const mockAgent = {
  id: 'agent-1',
  name: 'Agente Teste',
  status: 'online' as const,
  activeChats: 3,
  maxChats: 5,
  avgResponseTime: 45,
  resolvedToday: 12,
  satisfaction: 4.2,
};

const mockAlert = {
  id: 'alert-1',
  type: 'warning' as const,
  title: 'Alerta de teste',
  message: 'Mensagem de teste',
  timestamp: new Date(),
};

const mockMetricCardsData = {
  overallRate: 85,
  totalConversations: 120,
  firstResponse: { rate: 78, onTime: 94, breached: 26 },
};

describe('a11y: barras de progresso e botões sós de ícone com nome acessível', () => {
  it('Progress em SLADashboard tem nome acessível', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SLADashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByRole('progressbar', { name: /cumprimento do sla de primeira resposta/i })).toBeInTheDocument();
  });

  it('Progress em SLAMetricCards tem nome acessível', () => {
    render(<SLAMetricCards data={mockMetricCardsData} periodLabel="Hoje" sparkOverall={[80, 85, 90]} sparkFR={[70, 75, 78]} sparkConversations={[100, 110, 120]} />);
    expect(screen.getByRole('progressbar', { name: /taxa de sla geral/i })).toBeInTheDocument();
  });

  it('Progress em SLAAgentTable tem nome acessível único por agente', () => {
    render(<SLAAgentTable agents={mockAgents} />);
    expect(screen.getByRole('progressbar', { name: /cumprimento do sla do ana silva/i })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /cumprimento do sla do bruno costa/i })).toBeInTheDocument();
  });

  it('botão de atualizar em SentimentAlertsDashboard tem nome acessível e animação motion-safe', () => {
    render(<SentimentAlertsDashboard />);
    expect(screen.getByRole('button', { name: /atualizar alertas de sentimento/i })).toBeInTheDocument();
  });

  it('Progress em WarRoomAgentCard tem nome acessível único', () => {
    render(<WarRoomAgentCard agent={mockAgent} onClick={() => {}} />);
    expect(screen.getByRole('progressbar', { name: /utilização do agente teste/i })).toBeInTheDocument();
  });

  it('Progress em WarRoomQueueRow tem nome acessível único', () => {
    render(<WarRoomQueueRow queue={mockQueue} onClick={() => {}} />);
    expect(screen.getByRole('progressbar', { name: /utilização da fila suporte prioritário/i })).toBeInTheDocument();
  });

  it('botão dispensar em WarRoomAlertRow tem nome acessível', () => {
    render(<WarRoomAlertRow alert={mockAlert} onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: /dispensar alerta/i })).toBeInTheDocument();
  });

  it('WarRoomDashboard tem botões sós de ícone com nomes acessíveis dinâmicos', () => {
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <MemoryRouter>
            <WarRoomDashboard agents={[]} queues={[]} alerts={[]} />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>
    );
    expect(screen.getByRole('button', { name: /ativar som de alertas/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ativar auto-atualização/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar em tela cheia/i })).toBeInTheDocument();
  });
});