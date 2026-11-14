import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SatisfactionMetrics } from '../SatisfactionMetrics';
import { NPS_SURVEY_LIMIT } from '@/hooks/business/useNPSSurveys';

// R3-QA — o KPI de NPS do card de Satisfação ignorava o teto de leitura (500
// respostas, `useNPSSurveys`): quando a leitura batia no teto, o painel
// apresentava o score calculado sobre a amostra truncada como se fosse o
// total do período, sem o aviso que o NPSDashboard já mostra para o mesmo caso.
const mockBreakdown = vi.fn();
vi.mock('@/hooks/business/useCSAT', () => ({
  useSatisfactionBreakdown: (...args: unknown[]) => mockBreakdown(...args),
}));

const mockUseNPSSurveys = vi.fn();
vi.mock('@/hooks/business/useNPSSurveys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/business/useNPSSurveys')>();
  return { ...actual, useNPSSurveys: () => mockUseNPSSurveys() };
});

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

describe('SatisfactionMetrics — KPI de NPS avisa quando a leitura foi truncada (R3-QA)', () => {
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

  it('com isTruncated=true do hook, o card de NPS mostra o aviso de amostra truncada', () => {
    mockUseNPSSurveys.mockReturnValue({
      surveys: [{ id: 's1', contact_id: 'c1', agent_id: null, score: 10, feedback: null, survey_type: 'manual', created_at: new Date().toISOString() }],
      isTruncated: true,
    });

    render(<SatisfactionMetrics />);

    const npsLabel = screen.getAllByText('NPS').find((el) => el.closest('div[data-testid="kpi-card"]'));
    const npsCard = npsLabel?.closest('div[data-testid="kpi-card"]') as HTMLElement;
    expect(npsCard).toBeTruthy();
    expect(within(npsCard).getByText(`baseado nas últimas ${NPS_SURVEY_LIMIT} respostas`)).toBeInTheDocument();
  });

  it('com isTruncated=false, o card de NPS NÃO mostra o aviso de truncamento', () => {
    mockUseNPSSurveys.mockReturnValue({
      surveys: [{ id: 's1', contact_id: 'c1', agent_id: null, score: 10, feedback: null, survey_type: 'manual', created_at: new Date().toISOString() }],
      isTruncated: false,
    });

    render(<SatisfactionMetrics />);

    expect(screen.queryByText(`baseado nas últimas ${NPS_SURVEY_LIMIT} respostas`)).not.toBeInTheDocument();
  });
});
