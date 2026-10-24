import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SentimentTrendCard } from '../overview/SentimentTrendCard';

const mockUseRealSentimentData = vi.fn();
vi.mock('../SentimentHelpers', () => ({
  useRealSentimentData: (...args: unknown[]) => mockUseRealSentimentData(...args),
}));

describe('SentimentTrendCard', () => {
  it('sem dados (null), mostra empty state compacto', () => {
    mockUseRealSentimentData.mockReturnValue(null);
    render(<SentimentTrendCard />);
    expect(screen.getByText('Sem análises de sentimento no período')).toBeInTheDocument();
  });

  it('com dados, renderiza o plot e a legenda com os 3 rótulos', () => {
    mockUseRealSentimentData.mockReturnValue([
      { date: '01/06', positive: 60, neutral: 30, negative: 10, avg_score: 50, alerts_count: 0 },
      { date: '02/06', positive: 55, neutral: 35, negative: 10, avg_score: 45, alerts_count: 1 },
    ]);
    render(<SentimentTrendCard />);
    expect(screen.getByTestId('sentiment-plot')).toBeInTheDocument();
    expect(screen.getByText('Positivo')).toBeInTheDocument();
    expect(screen.getByText('Neutro')).toBeInTheDocument();
    expect(screen.getByText('Negativo')).toBeInTheDocument();
  });
});
