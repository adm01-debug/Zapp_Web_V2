import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SatisfactionMetrics } from '../SatisfactionMetrics';

const mockBreakdown = vi.fn();
vi.mock('@/hooks/business/useCSAT', () => ({
  useSatisfactionBreakdown: (...args: unknown[]) => mockBreakdown(...args),
}));

const mockUseNPSSurveys = vi.fn();
vi.mock('@/hooks/business/useNPSSurveys', () => ({
  useNPSSurveys: () => mockUseNPSSurveys(),
}));

const emptyBreakdown = {
  totalResponses: 0,
  csatPercent: null,
  previousCsatPercent: null,
  trend: null,
  trendValue: 0,
  distribution: [],
  byAgent: [],
  byQueue: [],
  timeline: [],
};

describe('SatisfactionMetrics — KPI de NPS honesto', () => {
  beforeEach(() => {
    mockBreakdown.mockReset();
    mockUseNPSSurveys.mockReset();
    mockBreakdown.mockReturnValue({
      data: emptyBreakdown,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('sem NENHUMA pesquisa NPS, diz que nenhuma pesquisa foi enviada (não "sem respostas no período")', () => {
    mockUseNPSSurveys.mockReturnValue({ surveys: [], npsLoaded: true });

    render(<SatisfactionMetrics />);

    const npsLabel = screen.getAllByText('NPS').find((el) => el.closest('div[data-testid="kpi-card"]'));
    const npsCard = npsLabel?.closest('div[data-testid="kpi-card"]') as HTMLElement;
    expect(npsCard).toBeTruthy();
    expect(within(npsCard).getByText('Sem pesquisas enviadas')).toBeInTheDocument();
    expect(within(npsCard).getByText('nenhuma pesquisa enviada ainda')).toBeInTheDocument();
    expect(within(npsCard).queryByText('Sem avaliações no período')).not.toBeInTheDocument();
  });

  it('com pesquisas NPS registradas, não mostra o rótulo de "nenhuma pesquisa enviada"', () => {
    mockUseNPSSurveys.mockReturnValue({
      surveys: [{ id: 's1', contact_id: 'c1', agent_id: null, score: 10, feedback: null, survey_type: 'manual', created_at: new Date().toISOString() }],
    });

    render(<SatisfactionMetrics />);

    expect(screen.queryByText('Sem pesquisas enviadas')).not.toBeInTheDocument();
    expect(screen.queryByText('nenhuma pesquisa enviada ainda')).not.toBeInTheDocument();
  });
});
