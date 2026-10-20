import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import type { DashboardFiltersState } from '@/components/dashboard/dashboardFilterDefaults';

/**
 * Cartão de paridade V3: o selo de filtros ativos mostra quantos filtros estão aplicados e limpa
 * todos em um clique (periodo volta para "hoje" no fuso do app, fila e agente zeram).
 */

vi.mock('@/hooks/business/useQueues', () => ({
  useQueues: () => ({ queues: [], loading: false, error: null }),
}));

vi.mock('@/hooks/crm/useAgents', () => ({
  useAgents: () => ({ agents: [], loading: false, error: null }),
}));

function renderComFiltros(
  filters: DashboardFiltersState,
  { showTeamFilters = true, onFiltersChange = vi.fn() }: { showTeamFilters?: boolean; onFiltersChange?: (f: DashboardFiltersState) => void } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const utils = render(
    <Wrapper>
      <DashboardFilters filters={filters} onFiltersChange={onFiltersChange} showTeamFilters={showTeamFilters} />
    </Wrapper>,
  );
  return { onFiltersChange, ...utils };
}

const semFiltro: DashboardFiltersState = {
  period: 'today',
  dateRange: { from: new Date('2026-10-13T00:00:00'), to: new Date('2026-10-13T23:59:59') },
  queueId: null,
  agentId: null,
};

describe('DashboardFilters — selo de filtros ativos com Limpar', () => {
  it('sem filtro aplicado não mostra o selo', () => {
    renderComFiltros(semFiltro);
    expect(screen.queryByTestId('filter-clear')).not.toBeInTheDocument();
  });

  it('conta período fora de "hoje", fila e agente', () => {
    renderComFiltros({ ...semFiltro, period: 'week', queueId: 'q-1', agentId: 'a-1' });

    const selo = screen.getByTestId('filter-clear');
    expect(selo).toHaveTextContent('3 filtros');
    expect(screen.getByRole('button', { name: 'Limpar filtros (3 ativos)' })).toBe(selo);
  });

  it('um clique limpa todos os filtros e volta ao recorte padrão', () => {
    const { onFiltersChange } = renderComFiltros({ ...semFiltro, period: 'month', queueId: 'q-1', agentId: 'a-1' });

    fireEvent.click(screen.getByTestId('filter-clear'));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 'today',
        queueId: null,
        agentId: null,
        dateRange: { from: expect.any(Date), to: expect.any(Date) },
      }),
    );
  });

  it('usa singular quando só um filtro está aplicado', () => {
    renderComFiltros({ ...semFiltro, period: 'custom' });
    const selo = screen.getByTestId('filter-clear');
    expect(selo).toHaveTextContent('1 filtro');
    expect(screen.getByRole('button', { name: 'Limpar filtros (1 ativo)' })).toBe(selo);
  });

  it('não conta fila e agente quando o filtro de time está oculto (agent/special_agent)', () => {
    renderComFiltros(
      { ...semFiltro, queueId: 'q-1', agentId: 'a-1' },
      { showTeamFilters: false },
    );
    expect(screen.queryByTestId('filter-clear')).not.toBeInTheDocument();
  });
});
