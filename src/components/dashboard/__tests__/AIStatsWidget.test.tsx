import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// IA-023: sentimento médio ausente é "sem dado" (—), nunca 0% nem 50%;
// 0 continua sendo exibido como 0%.
const h = vi.hoisted(() => ({ stats: vi.fn() }));

vi.mock('@/hooks/analytics/useAIStats', () => ({
  useAIStats: (...args: unknown[]) => h.stats(...args),
}));

import { AIStatsWidget } from '../AIStatsWidget';

const baseStats = {
  totalAnalyses: 5,
  avgSentimentScore: null as number | null,
  positiveSentiment: 3,
  negativeSentiment: 1,
  neutralSentiment: 1,
  transcriptionsCount: 2,
  activeAlerts: [],
  sentimentTrend: [],
  trends: {
    analyses: { direction: 'up' as const, change: 5, percentage: 5 },
    sentiment: { direction: 'up' as const, change: 5, percentage: 5 },
    negative: { direction: 'up' as const, change: 5, percentage: 5 },
    transcriptions: { direction: 'up' as const, change: 5, percentage: 5 },
  },
};

describe('AIStatsWidget — zero e ausência (IA-023)', () => {
  beforeEach(() => h.stats.mockReset());

  it('média ausente renderiza "—", nunca "0%"', () => {
    h.stats.mockReturnValue({ data: { ...baseStats, avgSentimentScore: null }, isLoading: false });
    render(<AIStatsWidget />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('média 0 continua sendo exibida como 0%', () => {
    h.stats.mockReturnValue({ data: { ...baseStats, avgSentimentScore: 0 }, isLoading: false });
    render(<AIStatsWidget />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('média fracionária vira percentual', () => {
    h.stats.mockReturnValue({ data: { ...baseStats, avgSentimentScore: 0.42 }, isLoading: false });
    render(<AIStatsWidget />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});
