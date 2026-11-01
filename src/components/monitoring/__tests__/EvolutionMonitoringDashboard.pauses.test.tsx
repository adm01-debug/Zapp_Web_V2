import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Ponta a ponta do painel "Pausas de instância" (C121): a aba existe no monitor da
 * Evolution e, ao abrir, monta o painel REAL (hook e service reais) que lê
 * `instance_pauses`. Com a aba fechada a tabela NÃO é consultada.
 * Os painéis irmãos e o hook do monitor são trocados por stubs: aqui só importa a
 * ligação da aba.
 */

import { EvolutionMonitoringDashboard } from '@/components/monitoring/EvolutionMonitoringDashboard';

const h = vi.hoisted(() => ({ limit: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          limit: () => h.limit(table),
        }),
      }),
    }),
  },
}));
vi.mock('@/lib/logger', () => {
  const noop = () => {};
  return {
    getLogger: () => ({ error: noop, warn: noop, info: noop, debug: noop }),
    log: { error: noop, warn: noop, info: noop, debug: noop },
  };
});
vi.mock('@/components/monitoring/hooks/useEvolutionMonitoring', () => ({
  useEvolutionMonitoring: () => ({
    connections: [], healthLogs: [], availabilityLogs: [], healthLogsTruncated: false,
    loading: false, refreshing: false, webhookTest: null, webhookConfig: null,
    messageStats: [], reconfiguring: false, diagnostic: null, diagnosing: false,
    uptime: 100, sparklines: {}, instanceUptimes: [], notificationsEnabled: false,
    soundEnabled: false, setSoundEnabled: vi.fn(), requestNotifications: vi.fn(),
    period: '24h', changePeriod: vi.fn(), autoRefresh: false, setAutoRefresh: vi.fn(),
    countdown: 0, runHealthCheck: vi.fn(), testWebhookDelivery: vi.fn(),
    checkWebhookConfig: vi.fn(), reconfigureWebhook: vi.fn(), runDiagnostic: vi.fn(),
    errors: {}, lastUpdatedAt: null, refetch: vi.fn(),
  }),
}));
vi.mock('@/components/monitoring/MonitoringStatsCards', () => ({ MonitoringStatsCards: () => null }));
vi.mock('@/components/monitoring/MonitoringMessageChart', () => ({ MonitoringMessageChart: () => null }));
vi.mock('@/components/monitoring/MonitoringConnectionsList', () => ({ MonitoringConnectionsList: () => null }));
vi.mock('@/components/monitoring/MonitoringWebhookPanel', () => ({ MonitoringWebhookPanel: () => null }));
vi.mock('@/components/monitoring/MonitoringHealthLogs', () => ({ MonitoringHealthLogs: () => null }));
vi.mock('@/components/monitoring/MonitoringDiagnosticPanel', () => ({ MonitoringDiagnosticPanel: () => null }));
vi.mock('@/components/monitoring/MonitoringEventTimeline', () => ({ MonitoringEventTimeline: () => null }));
vi.mock('@/components/monitoring/MonitoringAvailabilityHeatmap', () => ({ MonitoringAvailabilityHeatmap: () => null }));
vi.mock('@/components/monitoring/MonitoringSLAPanel', () => ({ MonitoringSLAPanel: () => null }));
vi.mock('@/components/monitoring/MonitoringIncidents', () => ({ MonitoringIncidents: () => null }));

const pause = {
  id: 'p1', instance: 'inst-a', paused_until: new Date(Date.now() + 30 * 60_000).toISOString(),
  reason: 'limite de envio', auto: false, resumed_at: null,
  created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  investigated_at: null, investigation_notes: null,
};

beforeEach(() => {
  h.limit.mockReset();
  h.limit.mockResolvedValue({ data: [pause], error: null });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => cleanup());

describe('EvolutionMonitoringDashboard — aba "Pausas"', () => {
  it('só lê instance_pauses depois de abrir a aba e oferece "Marcar investigada"', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <EvolutionMonitoringDashboard />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const tab = screen.getByRole('tab', { name: /Pausas/i });
    expect(h.limit).not.toHaveBeenCalled();

    // Radix Tabs ativa a aba no mouseDown (botão principal, sem Ctrl).
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });

    expect(await screen.findByText('Pausas de instância')).toBeTruthy();
    expect(await screen.findByText('inst-a')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marcar investigada' })).toBeTruthy();
    expect(h.limit).toHaveBeenCalledWith('instance_pauses');
  });
});
