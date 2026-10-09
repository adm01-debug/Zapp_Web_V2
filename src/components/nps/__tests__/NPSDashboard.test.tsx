import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { NPSDashboard } from '../NPSDashboard';
import { useNPSSurveys } from '@/hooks/business/useNPSSurveys';

vi.mock('@/hooks/business/useNPSSurveys', () => ({
  useNPSSurveys: vi.fn(),
}));

const mockMetrics = {
  npsScore: 42,
  totalResponses: 1200,
  promoters: 800,
  passives: 250,
  detractors: 150,
};

const mockSurveys = [
  { id: 's1', score: 9, feedback: 'Great service', survey_type: 'periodic' as const, created_at: '2026-10-01T00:00:00Z' },
  { id: 's2', score: 7, feedback: 'Okay experience', survey_type: 'post_resolution' as const, created_at: '2026-10-02T00:00:00Z' },
];

describe('NPSDashboard MetricCard contraste AA', () => {
  beforeEach(() => {
    vi.mocked(useNPSSurveys).mockReturnValue({
      surveys: mockSurveys,
      isLoading: false,
      metrics: mockMetrics,
    });
  });

  it('Total de Respostas usa text-[hsl(var(--primary-text))] no valor', () => {
    render(<NPSDashboard />);
    const valor = screen.getByText('1200');
    expect(valor).toHaveClass('text-[hsl(var(--primary-text))]');
  });

  it('Promotores usa text-[hsl(var(--success))] no valor', () => {
    render(<NPSDashboard />);
    const valor = screen.getByText('800');
    expect(valor).toHaveClass('text-[hsl(var(--success))]');
  });

  it('Passivos usa text-[hsl(var(--warning-text))] no valor', () => {
    render(<NPSDashboard />);
    const valor = screen.getByText('250');
    expect(valor).toHaveClass('text-[hsl(var(--warning-text))]');
  });

  it('Detratores usa text-[hsl(var(--destructive-text))] no valor', () => {
    render(<NPSDashboard />);
    const valor = screen.getByText('150');
    expect(valor).toHaveClass('text-[hsl(var(--destructive-text))]');
  });
});