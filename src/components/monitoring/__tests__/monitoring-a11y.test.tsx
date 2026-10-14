import { axe } from 'vitest-axe';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MonitoringHealthLogs } from '@/components/monitoring/MonitoringHealthLogs';
import { MonitoringSLAPanel } from '@/components/monitoring/MonitoringSLAPanel';

const logsFixture = [
  { id: '1', instance_id: 'inst-A', status: 'healthy', response_time_ms: 120, error_message: null, checked_at: '2026-10-10T10:00:00Z' },
  { id: '2', instance_id: 'inst-B', status: 'error', response_time_ms: null, error_message: 'timeout', checked_at: '2026-10-10T10:01:00Z' },
  { id: '3', instance_id: 'inst-A', status: 'degraded', response_time_ms: 600, error_message: null, checked_at: '2026-10-10T10:02:00Z' },
];

describe('a11y — nomes acessíveis nos controles do monitoramento', () => {
  it('os dois combobox de filtro do Histórico de Health Checks expõem aria-label', () => {
    render(<MonitoringHealthLogs healthLogs={logsFixture} />);

    expect(screen.getByRole('combobox', { name: 'Filtrar por status' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filtrar por instância' })).toBeInTheDocument();
  });

  it('o gauge de SLA global e os progressbars por instância expõem aria-label', () => {
    render(
      <MonitoringSLAPanel
        uptime={{ percentage: 99.7, totalChecks: 100, healthyChecks: 99, lastDowntime: null }}
        instanceUptimes={[
          { instanceId: 'inst-A', percentage: 100, totalChecks: 50, healthyChecks: 50, avgLatency: 100, lastError: null },
          { instanceId: 'inst-B', percentage: 95, totalChecks: 50, healthyChecks: 47, avgLatency: 200, lastError: null },
        ]}
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'SLA global' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'SLA de inst-A' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'SLA de inst-B' })).toBeInTheDocument();
  });

  it('não há violações de axe nos combobox do Histórico de Health Checks', async () => {
    const { container } = render(<MonitoringHealthLogs healthLogs={logsFixture} />);
    const resultado = await axe(container, { runOnly: { type: 'rule', values: ['button-name'] } });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });

  it('não há violações de axe nos progressbars do painel de SLA', async () => {
    const { container } = render(
      <MonitoringSLAPanel
        uptime={{ percentage: 99.7, totalChecks: 100, healthyChecks: 99, lastDowntime: null }}
        instanceUptimes={[
          { instanceId: 'inst-A', percentage: 100, totalChecks: 50, healthyChecks: 50, avgLatency: 100, lastError: null },
        ]}
      />,
    );
    const resultado = await axe(container, { runOnly: { type: 'rule', values: ['aria-progressbar-name'] } });
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});
