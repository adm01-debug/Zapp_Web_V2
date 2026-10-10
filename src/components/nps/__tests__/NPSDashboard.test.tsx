import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NPSDashboard } from '../NPSDashboard';

const mockUseNPSSurveys = vi.fn();
vi.mock('@/hooks/business/useNPSSurveys', () => ({
  useNPSSurveys: () => mockUseNPSSurveys(),
}));

function baseMetrics() {
  return { npsScore: 60, totalResponses: 10, promoters: 6, passives: 3, detractors: 1 };
}

describe('NPSDashboard', () => {
  it('legenda da distribuição usa ícone+token, não emoji', () => {
    mockUseNPSSurveys.mockReturnValue({ surveys: [], isLoading: false, metrics: baseMetrics() });
    render(<NPSDashboard />);

    // Nenhum emoji colorido na legenda (o par ícone+token do gráfico manda).
    expect(screen.queryAllByText(/🟢|🟡|🔴/)).toHaveLength(0);

    const promotores = screen.getByText('Promotores');
    const passivos = screen.getByText('Passivos');
    const detratores = screen.getByText('Detratores');

    expect(promotores.querySelector('svg')).not.toBeNull();
    expect(passivos.querySelector('svg')).not.toBeNull();
    expect(detratores.querySelector('svg')).not.toBeNull();

    // Mesmo par de tokens dos MetricCards (linhas 82-84).
    expect(promotores.className).toContain('text-success');
    expect(passivos.className).toContain('text-warning');
    expect(detratores.className).toContain('text-destructive');
  });
});
