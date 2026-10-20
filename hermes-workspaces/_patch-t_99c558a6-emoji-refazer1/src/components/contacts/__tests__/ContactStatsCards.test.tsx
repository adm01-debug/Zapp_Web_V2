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
    fornecedoresTotal: 10,
    fornecedores30: 5,
    deltaFornecedoresPct: -20,
    seriesTotalCumulative12w: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    seriesNovosDaily30: [1, 2, 3, 4, 5, 6, 7],
    seriesEmpresasCumulative12w: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    seriesFornecedoresWeekly12: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ...overrides,
  };
}

/** Valor exibido no card "Total de Contatos" (mesmo testid do KPI). */
function totalCardValue(): string | null {
  const card = screen.getByText('Total de Contatos').closest('[data-testid="kpi-card"]') as HTMLElement;
  return card.querySelector('[data-testid="kpi-value"]')?.textContent ?? null;
}

/**
 * Reproduz o badge da aba "Todos" (ContactTypeTabs → CountBadge): número estático
 * vindo de `contactCountByType['all']`, a MESMA fonte que alimenta `totalAll`.
 */
function TodosBadge({ all }: { all: number }) {
  return <span data-testid="tab-count-todos">{all.toLocaleString('pt-BR')}</span>;
}

describe('ContactStatsCards', () => {
  it('mostra skeleton enquanto o agregado carrega — mas o Total (mesma fonte do badge) já aparece', () => {
    mockUseContactsKpi.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<ContactStatsCards totalAll={3124} fornecedoresAll={10} includeLegacy />);
    // Os 3 cards do agregado seguem em esqueleto...
    expect(container.querySelectorAll('.animate-shimmer')).toHaveLength(3);
    // ...e o Total não espera o agregado: é o mesmo dado que alimenta a aba "Todos".
    expect(totalCardValue()).toBe('3.124');
  });

  it('Total coincide com o badge da aba "Todos" no mesmo snapshot — legados DESLIGADOS', () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi(), isLoading: false });
    render(
      <>
        <TodosBadge all={2529} />
        <ContactStatsCards totalAll={2529} fornecedoresAll={0} />
      </>,
    );
    // Sem waitFor: o snapshot tem de coincidir já no primeiro frame (sem CountUp 0→N).
    expect(totalCardValue()).toBe('2.529');
    expect(totalCardValue()).toBe(screen.getByTestId('tab-count-todos').textContent);
  });

  it('Total coincide com o badge da aba "Todos" no mesmo snapshot — legados LIGADOS', () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi(), isLoading: false });
    render(
      <>
        <TodosBadge all={3124} />
        <ContactStatsCards totalAll={3124} fornecedoresAll={0} includeLegacy />
      </>,
    );
    expect(totalCardValue()).toBe('3.124');
    expect(totalCardValue()).toBe(screen.getByTestId('tab-count-todos').textContent);
  });

  it('renderiza os 4 KPIs com valores reais (totalAll/fornecedoresAll vêm de fora, não do hook)', async () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi(), isLoading: false });
    render(<ContactStatsCards totalAll={1516} fornecedoresAll={7} />);
    expect(screen.getByText('Total de Contatos')).toBeInTheDocument();
    expect(screen.getByText('Fornecedores')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1.516')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('7')).toBeInTheDocument());
  });

  it('delta positivo mostra seta pra cima e sinal de +', async () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi({ deltaTotalPct: 85 }), isLoading: false });
    render(<ContactStatsCards totalAll={1516} fornecedoresAll={7} />);
    await waitFor(() => expect(screen.getByText('+85%')).toBeInTheDocument());
  });

  it('delta negativo mostra sem sinal de +', async () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi({ deltaFornecedoresPct: -20 }), isLoading: false });
    render(<ContactStatsCards totalAll={1516} fornecedoresAll={7} />);
    await waitFor(() => expect(screen.getByText('-20%')).toBeInTheDocument());
  });

  it('delta zero mostra "sem alteração" em vez de 0%', () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi({ deltaNovosPct: 0 }), isLoading: false });
    render(<ContactStatsCards totalAll={1516} fornecedoresAll={7} />);
    expect(screen.getAllByText('sem alteração').length).toBeGreaterThan(0);
  });

  it('KPI Empresas não tem delta calculado (null) e não renderiza sparkline quando a série é zerada', () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi({ empresasDistinct: 0, seriesEmpresasCumulative12w: Array(12).fill(0) }), isLoading: false });
    render(<ContactStatsCards totalAll={1516} fornecedoresAll={7} />);
    const empresasCard = screen.getByText('Empresas').closest('[data-testid="kpi-card"]') as HTMLElement;
    // Só o ícone do tile é um svg — sem o segundo svg (sparkline) quando a série é zerada.
    expect(empresasCard.querySelectorAll('svg')).toHaveLength(1);
    // deltaPct=null (noData) → subtitle oculto, 'sem alteração' não aparece
    expect(empresasCard.textContent).not.toContain('sem alteração');
  });

  it('trava a geometria Navy do KPI (card 108px, tile 60px, valor text-kpi-value)', () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi(), isLoading: false });
    render(<ContactStatsCards totalAll={1516} fornecedoresAll={7} />);
    for (const card of screen.getAllByTestId('kpi-card')) expect(card).toHaveClass('h-[108px]');
    for (const tile of screen.getAllByTestId('kpi-tile')) expect(tile).toHaveClass('w-[60px]', 'h-[60px]');
    for (const value of screen.getAllByTestId('kpi-value')) expect(value).toHaveClass('text-kpi-value');
  });

  it('repassa o toggle "Mostrar legados" para o KPI (mesmo critério da lista e das abas)', () => {
    mockUseContactsKpi.mockReturnValue({ data: baseKpi(), isLoading: false });
    render(<ContactStatsCards totalAll={1516} fornecedoresAll={7} />);
    expect(mockUseContactsKpi).toHaveBeenLastCalledWith(false);
    render(<ContactStatsCards totalAll={2498} fornecedoresAll={7} includeLegacy />);
    expect(mockUseContactsKpi).toHaveBeenLastCalledWith(true);
  });
});
