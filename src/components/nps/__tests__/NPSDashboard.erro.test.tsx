import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NPSDashboard } from '../NPSDashboard';

/**
 * t_1944d290 — com a leitura quebrada o painel caía no estado vazio ("Nenhuma
 * pesquisa NPS enviada ainda"), o que é mentira: a base não foi carregada.
 */
const mockUseNPSSurveys = vi.fn();

vi.mock('@/hooks/business/useNPSSurveys', () => ({
  useNPSSurveys: () => mockUseNPSSurveys(),
  NPS_SURVEY_LIMIT: 500,
}));

function stateWith(overrides: Record<string, unknown> = {}) {
  return {
    surveys: [],
    isLoading: false,
    error: null,
    isTruncated: false,
    metrics: { totalResponses: 0, promoters: 0, passives: 0, detractors: 0, npsScore: 0, avgScore: 0 },
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('NPSDashboard — falha de leitura', () => {
  beforeEach(() => mockUseNPSSurveys.mockReset());

  it('falha mostra o estado de erro, não o estado vazio nem NPS 0', () => {
    mockUseNPSSurveys.mockReturnValue(stateWith({ error: 'permission denied for table nps_surveys' }));

    render(<NPSDashboard />);

    expect(screen.getByTestId('nps-error-state')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível carregar as pesquisas NPS')).toBeInTheDocument();
    expect(screen.queryByTestId('nps-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhuma pesquisa NPS enviada ainda')).not.toBeInTheDocument();
    expect(screen.queryByText('NPS Score')).not.toBeInTheDocument();
    expect(screen.queryByText('Total de Respostas')).not.toBeInTheDocument();
  });

  it('"Tentar novamente" chama o refetch do hook', () => {
    const refetch = vi.fn();
    mockUseNPSSurveys.mockReturnValue(stateWith({ error: 'network error', refetch }));

    render(<NPSDashboard />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('teto de leitura atingido avisa em que base o número se apoia', () => {
    mockUseNPSSurveys.mockReturnValue(stateWith({
      surveys: [{ id: 's1', contact_id: 'c1', agent_id: null, score: 10, feedback: null, survey_type: 'manual', created_at: '2026-10-10T12:00:00.000Z' }],
      metrics: { totalResponses: 500, promoters: 400, passives: 50, detractors: 50, npsScore: 70, avgScore: 8.9 },
      isTruncated: true,
    }));

    render(<NPSDashboard />);

    expect(screen.getByTestId('nps-truncation-notice')).toHaveTextContent('Baseado nas últimas 500 respostas');
    expect(screen.getByText('NPS Score')).toBeInTheDocument();
  });

  it('com respostas dentro do teto não há aviso de recorte', () => {
    mockUseNPSSurveys.mockReturnValue(stateWith({
      surveys: [{ id: 's1', contact_id: 'c1', agent_id: null, score: 10, feedback: null, survey_type: 'manual', created_at: '2026-10-10T12:00:00.000Z' }],
      metrics: { totalResponses: 3, promoters: 2, passives: 0, detractors: 1, npsScore: 33, avgScore: 8.3 },
    }));

    render(<NPSDashboard />);

    expect(screen.queryByTestId('nps-truncation-notice')).not.toBeInTheDocument();
  });
});
