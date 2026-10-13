import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({
  invoke: vi.fn(),
  from: vi.fn(),
}));

// Só o client do Supabase é dublê. O hook e o painel são os REAIS.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: m.invoke }, from: m.from },
  SUPABASE_URL: 'https://supabase.test',
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useMonitoringActions } from '@/components/monitoring/hooks/useMonitoringActions';
import { MonitoringWebhookPanel } from '@/components/monitoring/MonitoringWebhookPanel';
import type { ConnectionInfo } from '@/components/monitoring/hooks/types';

const connections = [
  { id: '1', instance_id: 'inst-1', status: 'connected' },
] as unknown as ConnectionInfo[];

/** Monta o painel real sobre o hook real — o mesmo caminho do dashboard. */
function Harness() {
  const actions = useMonitoringActions(async () => {});
  return (
    <MonitoringWebhookPanel
      connections={connections}
      webhookTest={actions.webhookTest}
      webhookConfig={actions.webhookConfig}
      reconfiguring={actions.reconfiguring}
      onTest={actions.testWebhookDelivery}
      onReconfigure={actions.reconfigureWebhook}
      onCheckConfig={actions.checkWebhookConfig}
    />
  );
}

describe('PE-67 — o painel de webhook usa as ações do servidor (sem mensagem de teste)', () => {
  beforeEach(() => {
    m.invoke.mockReset();
    m.from.mockReset();
  });

  it('"Testar E2E" chama o autoteste do servidor e NUNCA escreve/apaga em messages', async () => {
    m.invoke.mockResolvedValue({
      data: { action: 'selftest', instance: 'inst-1', ok: true, status: 200, latencyMs: 42, event: 'selftest' },
      error: null,
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /testar e2e/i }));

    await waitFor(() => expect(m.invoke).toHaveBeenCalledWith(
      'webhook-diagnostic',
      expect.objectContaining({ body: { action: 'selftest', instanceName: 'inst-1' } }),
    ));

    // Nenhuma chamada ao webhook pelo navegador...
    expect(m.invoke).not.toHaveBeenCalledWith('evolution-webhook', expect.anything());
    // ...e nenhum INSERT/DELETE pela tabela messages.
    expect(m.from).not.toHaveBeenCalled();

    expect(await screen.findByText('Sucesso')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('mostra o resultado por etapa (assinatura, entrega, gravação)', async () => {
    m.invoke.mockResolvedValue({
      data: { action: 'selftest', instance: 'inst-1', ok: true, status: 200, latencyMs: 12, event: 'selftest' },
      error: null,
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /testar e2e/i }));

    expect(await screen.findByText(/Assinatura \(credencial da instância\):/)).toBeInTheDocument();
    expect(screen.getByText(/Entrega ao webhook:/)).toBeInTheDocument();
    expect(screen.getByText(/Gravação:/)).toBeInTheDocument();
  });

  it('estado de erro explícito quando a instância não tem credencial (sem-credencial)', async () => {
    m.invoke.mockResolvedValue({
      data: { action: 'selftest', instance: 'inst-1', ok: false, reason: 'sem-credencial' },
      error: null,
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /testar e2e/i }));

    expect(await screen.findByText('Falha')).toBeInTheDocument();
    expect(screen.getByText(/Credencial ausente/)).toBeInTheDocument();
    expect(m.from).not.toHaveBeenCalled();
  });

  it('a config mostra a lista de eventos esperada que o SERVIDOR devolveu para o flavor', async () => {
    m.invoke.mockResolvedValue({
      data: {
        diagnostics: [{
          instance: 'inst-1',
          webhook: {
            url: 'https://supabase.test/functions/v1/evolution-webhook',
            events: ['MESSAGE', 'READRECEIPT'],
            expectedEvents: ['Message', 'ReadReceipt', 'ConnectionUpdate', 'SendMessage'],
            presentCount: 2,
            urlCorrect: true,
          },
        }],
      },
      error: null,
    });

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /carregar config/i }));

    await waitFor(() => expect(m.invoke).toHaveBeenCalledWith(
      'webhook-diagnostic',
      expect.objectContaining({ body: { action: 'full-diagnostic', instanceName: 'inst-1' } }),
    ));

    expect(await screen.findByText('2/4 eventos')).toBeInTheDocument();
    // A lista esperada vem do servidor, não de uma constante do v2 no painel.
    expect(screen.getByText(/✗ ConnectionUpdate/)).toBeInTheDocument();
    expect(screen.getByText(/✓ Message/)).toBeInTheDocument();
  });
});
