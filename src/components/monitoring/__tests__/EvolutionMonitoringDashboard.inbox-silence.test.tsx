import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Ponta a ponta do painel "inbox muda": a aba existe no monitor da Evolution e,
 * ao abrir, monta o painel REAL (com o hook e o service reais) que chama a RPC
 * `admin_inbox_silence`. Com a aba fechada a RPC NÃO é consultada.
 * Os painéis irmãos e o hook do monitor são trocados por stubs: aqui só importa a
 * ligação da aba.
 */

import { EvolutionMonitoringDashboard } from '@/components/monitoring/EvolutionMonitoringDashboard';

const h = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
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

const row = {
  connection_id: 'c1', connection_name: 'Comercial', connection_status: 'connected',
  received_5m: 0, received_1h: 0, received_24h: 3, last_inbound_at: null,
  last_outbound_at: null, silence_minutes: 10, is_silent: true, top_conversations: [],
};

beforeEach(() => {
  h.rpc.mockReset();
  h.rpc.mockReturnValue({ abortSignal: vi.fn(async () => ({ data: [row], error: null })) });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});
afterEach(() => cleanup());

describe('EvolutionMonitoringDashboard — aba "Entrada muda"', () => {
  it('só consulta a RPC admin_inbox_silence depois de abrir a aba e mostra o painel real', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <EvolutionMonitoringDashboard />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const tab = screen.getByRole('tab', { name: /Entrada muda/i });
    expect(h.rpc).not.toHaveBeenCalled();

    // Radix Tabs ativa a aba no mouseDown (botão principal, sem Ctrl).
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });

    expect(await screen.findByText('Caixa de entrada muda')).toBeTruthy();
    expect(await screen.findByText('Comercial')).toBeTruthy();
    expect(h.rpc).toHaveBeenCalledWith('admin_inbox_silence');
  });
});
