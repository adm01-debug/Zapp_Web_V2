import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ContactStatsCards } from '../ContactStatsCards';

const mockUseContactsKpi = vi.fn();
vi.mock('@/hooks/crm/useContactsKpi', () => ({
  useContactsKpi: (...args: unknown[]) => mockUseContactsKpi(...args),
}));

function baseKpi(overrides: Partial<ReturnType<typeof mockUseContactsKpi>> = {}) {
  return {
    novos30: 50,
    novosPrev30: 40,
    deltaNovosPct: 25,
    deltaTotalPct: 12,
    empresasDistinct: 30,
    leadsTotal: 10,
    leads30: 5,
    deltaLeadsPct: -20,
    seriesTotalCumulative12w: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    seriesNovosDaily30: [1, 2, 3, 4, 5, 6, 7],
    seriesEmpresasWeekly12: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    seriesLeadsWeekly12: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ...overrides,
  };
}

describe('ContactStatsCards', () => {
  it('mostra skeleton enquanto carrega', () => {
    mockUseContactsKpi.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<ContactStatsCards totalAll={100} leadsAll={10} />);
    expect(container.querySelectorAll('.animate-shimmer')).toHaveLength(4);
  });

  it('renderiza os 4 KPIs com valores reais (totalAll/leadsAll vêm de fora, não do hook)', async () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi(), isLoading: false });
    render(<ContactStatsCards totalAll={1516} leadsAll={7} />);
    expect(screen.getByText('Total de Contatos')).toBeInTheDocument();
    expect(screen.getByText('Leads')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1.516')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
  });

  it('delta positivo mostra seta pra cima e sinal de +', async () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi({ deltaTotalPct: 85 }), isLoading: false });
    render(<ContactStatsCards totalAll={1516} leadsAll={7} />);
    await waitFor(() => expect(screen.getByText('+85%')).toBeInTheDocument());
  });

  it('delta negativo mostra sem sinal de +', async () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi({ deltaLeadsPct: -20 }), isLoading: false });
    render(<ContactStatsCards totalAll={1516} leadsAll={7} />);
    await waitFor(() => expect(screen.getByText('-20%')).toBeInTheDocument());
  });

  it('delta zero mostra "sem alteração" em vez de 0%', () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi({ deltaNovosPct: 0 }), isLoading: false });
    render(<ContactStatsCards totalAll={1516} leadsAll={7} />);
    expect(screen.getAllByText('sem alteração').length).toBeGreaterThan(0);
  });

  it('KPI Empresas não tem delta calculado (null) e não renderiza sparkline quando a série é zerada', () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi({ empresasDistinct: 0, seriesEmpresasWeekly12: Array(12).fill(0) }), isLoading: false });
    render(<ContactStatsCards totalAll={1516} leadsAll={7} />);
    const empresasCard = screen.getByText('Empresas').closest('[data-testid="kpi-card"]') as HTMLElement;
    // Só o ícone do tile é um svg — sem o segundo svg (sparkline) quando a série é zerada.
    expect(empresasCard.querySelectorAll('svg')).toHaveLength(1);
    // deltaPct=null (noData) → subtitle oculto, 'sem alteração' não aparece
    expect(empresasCard.textContent).not.toContain('sem alteração');
  });
});
