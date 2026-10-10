import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SLADashboard } from '../SLADashboard';

vi.mock('@/hooks/sla/useSLAMetrics', () => ({
  useSLAMetrics: () => ({
    data: {
      overall: {
        firstResponse: { rate: 90, onTime: 120, breached: 20 },
      },
      overallRate: 85.5,
      totalConversations: 500,
    },
    loading: false,
  }),
}));

vi.mock('@/hooks/sla/useSLAHistory', () => ({
  useSLAHistory: () => ({ data: null }),
}));

vi.mock('@/components/settings/SLAConfigurationManager', () => ({
  SLAConfigurationManager: () => null,
}));

vi.mock('@/components/settings/SLARulesManager', () => ({
  SLARulesManager: () => null,
}));

vi.mock('@/components/queues/SLAMetricCards', () => ({
  SLAMetricCards: () => null,
}));

vi.mock('@/components/queues/SLAAgentTable', () => ({
  SLAAgentTable: () => null,
}));

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/sla']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SLADashboard — rótulo de botão sem corte no celular', () => {
  it('o botão "Histórico" tem whitespace-normal para permitir quebra de linha', () => {
    renderWithProviders(<SLADashboard />);
    const button = screen.getByRole('button', { name: /Histórico/ });
    expect(button).toHaveClass('whitespace-normal');
  });

  it('o botão "Histórico" tem min-w-0 para evitar overflow em flex', () => {
    renderWithProviders(<SLADashboard />);
    const button = screen.getByRole('button', { name: /Histórico/ });
    expect(button).toHaveClass('min-w-0');
  });

  it('o botão "Histórico" contém o texto completo sem truncagem', () => {
    const { container } = renderWithProviders(<SLADashboard />);
    const button = container.querySelector('button');
    expect(button).toHaveTextContent('Histórico');
  });
});