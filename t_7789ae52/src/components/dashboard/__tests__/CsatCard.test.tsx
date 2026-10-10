import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CsatCard } from '../overview/CsatCard';

const mockUseCSAT = vi.fn();
vi.mock('@/hooks/business/useCSAT', () => ({
  useCSAT: (...args: unknown[]) => mockUseCSAT(...args),
}));

describe('CsatCard', () => {
  it('total 0, mostra "Sem avaliações no período"', () => {
    mockUseCSAT.mockReturnValue({ stats: { average: 0, total: 0, distribution: {}, trend: 0 } });
    render(<CsatCard period="month" onPeriodChange={vi.fn()} />);
    expect(screen.getByText('Sem avaliações no período')).toBeInTheDocument();
  });

  it('com avaliações, mostra nota média e distribuição por estrela', () => {
    mockUseCSAT.mockReturnValue({
      stats: { average: 4.8, total: 50, distribution: { 5: 36, 4: 10, 3: 2, 2: 1, 1: 1 }, trend: 12 },
    });
    render(<CsatCard period="month" onPeriodChange={vi.fn()} />);
    expect(screen.getByText('4.8')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.getAllByTestId('csat-row')).toHaveLength(5);
    expect(screen.getByText('72%')).toBeInTheDocument(); // 36/50
  });

  it('trend negativo não usa sinal de +', () => {
    mockUseCSAT.mockReturnValue({ stats: { average: 3.2, total: 10, distribution: { 5: 2, 4: 2, 3: 2, 2: 2, 1: 2 }, trend: -8 } });
    render(<CsatCard period="today" onPeriodChange={vi.fn()} />);
    expect(screen.getByText('-8%')).toBeInTheDocument();
  });
});
