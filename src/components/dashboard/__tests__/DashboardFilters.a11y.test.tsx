import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardFilters } from '../DashboardFilters';
import type { DashboardFiltersState } from '../dashboardFilterDefaults';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function TestQueryWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

const defaultFilters: DashboardFiltersState = {
  period: 'today',
  dateRange: { from: new Date('2026-10-09'), to: new Date('2026-10-09') },
  queueId: null,
  agentId: null,
};

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [], loading: false, error: null }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [], loading: false, error: null }),
}));

describe('DashboardFilters — acessibilidade dos filtros de fila e agente', () => {
  it('combobox de fila tem nome acessível "Filtrar por fila"', () => {
    render(
      <TestQueryWrapper>
        <DashboardFilters filters={defaultFilters} onFiltersChange={vi.fn()} />
      </TestQueryWrapper>,
    );
    expect(screen.getByRole('combobox', { name: 'Filtrar por fila' })).toBeInTheDocument();
  });

  it('combobox de agente tem nome acessível "Filtrar por agente"', () => {
    render(
      <TestQueryWrapper>
        <DashboardFilters filters={defaultFilters} onFiltersChange={vi.fn()} />
      </TestQueryWrapper>,
    );
    expect(screen.getByRole('combobox', { name: 'Filtrar por agente' })).toBeInTheDocument();
  });

  it('não tem violação de acessibilidade nos filtros (axe button-name)', async () => {
    const { container } = render(
      <TestQueryWrapper>
        <DashboardFilters filters={defaultFilters} onFiltersChange={vi.fn()} />
      </TestQueryWrapper>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});