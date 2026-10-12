import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import type { DashboardFiltersState } from '@/components/dashboard/dashboardFilterDefaults';

/**
 * N-049 — os dois comboboxes de time (fila e agente) precisam de nome acessível.
 * Sem `aria-label`, o leitor de tela anuncia o `combobox` sem dizer se é filtro
 * de fila ou de agente. A busca é por `getByRole('combobox', { name })`, que só
 * resolve quando o nome acessível existe (o `aria-label`).
 */

function renderComFiltros(filters: DashboardFiltersState) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    <Wrapper>
      <DashboardFilters filters={filters} onFiltersChange={vi.fn()} />
    </Wrapper>,
  );
}

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [], loading: false, error: null }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [], loading: false, error: null }),
}));

const filtrosDeTime: DashboardFiltersState = {
  period: 'today',
  dateRange: { from: new Date('2026-10-10'), to: new Date('2026-10-10') },
  queueId: null,
  agentId: null,
};

describe('DashboardFilters — nome acessível nos filtros de fila e agente (N-049)', () => {
  it('o combobox de fila responde pelo nome acessível "Filtrar por fila"', () => {
    renderComFiltros(filtrosDeTime);
    expect(
      screen.getByRole('combobox', { name: 'Filtrar por fila' }),
    ).toBeInTheDocument();
  });

  it('o combobox de agente responde pelo nome acessível "Filtrar por agente"', () => {
    renderComFiltros(filtrosDeTime);
    expect(
      screen.getByRole('combobox', { name: 'Filtrar por agente' }),
    ).toBeInTheDocument();
  });
});
