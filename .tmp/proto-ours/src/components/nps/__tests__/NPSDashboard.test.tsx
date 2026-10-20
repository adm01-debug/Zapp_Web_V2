import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NPSDashboard } from '../NPSDashboard';

const mockUseNPSSurveys = vi.fn();
vi.mock('@/hooks/business/useNPSSurveys', () => ({
  useNPSSurveys: () => mockUseNPSSurveys(),
}));

function stateWith(overrides: Record<string, unknown>) {
  return {
    surveys: [],
    isLoading: false,
    metrics: { totalResponses: 0, promoters: 0, passives: 0, detractors: 0, npsScore: 0, avgScore: 0 },
    refetch: vi.fn(),
    ...overrides,
  };
}

describe('NPSDashboard', () => {
  beforeEach(() => {
    mockUseNPSSurveys.mockReset();
  });

  it('sem nenhuma pesquisa, mostra o estado vazio e NÃO pinta medidor/cards zerados', () => {
    mockUseNPSSurveys.mockReturnValue(stateWith({}));

    render(<NPSDashboard />);

    expect(screen.getByTestId('nps-empty-state')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma pesquisa NPS enviada ainda')).toBeInTheDocument();
    // O antigo painel vazio mostrava NPS Score 0 ("Neutro") e KPIs zerados disfarçados de dado.
    expect(screen.queryByText('NPS Score')).not.toBeInTheDocument();
    expect(screen.queryByText('Neutro')).not.toBeInTheDocument();
    expect(screen.queryByText('Total de Respostas')).not.toBeInTheDocument();
    expect(screen.queryByText('Distribuição')).not.toBeInTheDocument();
  });

  it('com respostas, mostra a pontuação e os cards, sem o estado vazio', () => {
    mockUseNPSSurveys.mockReturnValue(stateWith({
      surveys: [{ id: 's1', contact_id: 'c1', agent_id: null, score: 10, feedback: null, survey_type: 'manual', created_at: '2026-10-10T12:00:00.000Z' }],
      metrics: { totalResponses: 3, promoters: 2, passives: 0, detractors: 1, npsScore: 33, avgScore: 8.3 },
    }));

    render(<NPSDashboard />);

    expect(screen.queryByTestId('nps-empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('NPS Score')).toBeInTheDocument();
    expect(screen.getByText('33')).toBeInTheDocument();
    expect(screen.getByText('Total de Respostas')).toBeInTheDocument();
    expect(screen.getByText('Promotores (9-10)')).toBeInTheDocument();
  });

  it('carregando, mostra esqueleto e não o estado vazio', () => {
    mockUseNPSSurveys.mockReturnValue(stateWith({ isLoading: true }));

    render(<NPSDashboard />);

    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('nps-empty-state')).not.toBeInTheDocument();
  });
});
