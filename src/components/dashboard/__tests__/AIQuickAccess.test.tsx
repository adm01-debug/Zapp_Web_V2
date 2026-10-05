import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { createElement } from 'react';

// DASH-CONTROLS-001 (ponto 1): `insightPeriod` alimentava o select do card
// "Insights de IA" sem entrar em nenhuma query, e "Análises Recentes" era um
// estado vazio fixo não ligado a dado real. Agora ambos leem
// conversation_analyses — estes testes provam a ligação.

const h = vi.hoisted(() => ({
  insights: vi.fn(),
  insightsArgs: [] as unknown[],
  recent: vi.fn(),
}));

vi.mock('@/hooks/analytics/useRecentAnalyses', () => ({
  useAIInsights: (period: unknown) => { h.insightsArgs.push(period); return h.insights(); },
  useRecentAnalyses: () => h.recent(),
}));
vi.mock('@/hooks/analytics/useAIStats', () => ({ useAIStats: () => ({ data: undefined }) }));
vi.mock('@/hooks/analytics/useActiveAIProvider', () => ({ useActiveAIProvider: () => ({ data: undefined }) }));
vi.mock('@/hooks/system/useNavigationHistory', () => ({ navigateToView: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../aiFeatures', () => ({
  AI_FEATURES: [],
  useAIFeatureNavigation: () => vi.fn(),
}));

// CardSelect (Radix) → <select> nativo para disparar a troca de período.
vi.mock('../overview/DashboardCard', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../overview/DashboardCard')>();
  return {
    ...mod,
    CardSelect: ({ value, onValueChange, options, testid }: {
      value: string; onValueChange: (v: string) => void;
      options: { value: string; label: string }[]; testid?: string;
    }) => createElement('select', {
      'data-testid': testid, value,
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value),
    }, options.map(o => createElement('option', { key: o.value, value: o.value }, o.label))),
  };
});

import { AIQuickAccess } from '../AIQuickAccess';

beforeEach(() => {
  h.insights.mockReset();
  h.recent.mockReset();
  h.insightsArgs.length = 0;
  h.insights.mockReturnValue({ data: { total: 0, negativePct: 0, topNegativeDepartment: null, avgSentimentScore: null } });
  h.recent.mockReturnValue({ data: [] });
});

describe('AIQuickAccess — controles ligados a dado real', () => {
  it('o select de período muda a query de insights (antes era decorativo)', () => {
    render(<AIQuickAccess />);
    expect(h.insightsArgs).toContain('24h');
    fireEvent.change(screen.getByTestId('ai-insights-period'), { target: { value: '30d' } });
    expect(h.insightsArgs).toContain('30d');
  });

  it('"Análises Recentes" lista as análises reais em vez do vazio fixo', () => {
    h.recent.mockReturnValue({
      data: [{
        id: 'a1', contactName: 'Maria Silva', sentiment: 'negativo',
        sentimentScore: 20, createdAt: '2026-10-05T10:00:00',
      }],
    });
    render(<AIQuickAccess />);
    const card = screen.getByTestId('ai-recent-card');
    // Antes: "Nenhuma análise recente" aparecia sempre, mesmo com dados.
    expect(within(card).getByText('Maria Silva')).toBeInTheDocument();
    expect(within(card).getByText('Negativo')).toBeInTheDocument();
    expect(within(card).queryByText('Nenhuma análise recente')).not.toBeInTheDocument();
  });

  it('normaliza critico antes de renderizar o rótulo da análise recente', () => {
    h.recent.mockReturnValue({
      data: [{
        id: 'a-critica', contactName: 'Caso crítico', sentiment: 'critico',
        sentimentScore: 5, createdAt: '2026-10-05T10:00:00',
      }],
    });

    render(<AIQuickAccess />);

    const card = screen.getByTestId('ai-recent-card');
    expect(within(card).getByText('Negativo')).toBeInTheDocument();
  });

  it('renderiza travessão para sentimento recente desconhecido', () => {
    h.recent.mockReturnValue({
      data: [{
        id: 'a-desconhecida', contactName: 'Sem classe', sentiment: 'fora-do-vocabulario',
        sentimentScore: null, createdAt: '2026-10-05T10:00:00',
      }],
    });

    render(<AIQuickAccess />);

    const card = screen.getByTestId('ai-recent-card');
    expect(within(card).getByText('—')).toBeInTheDocument();
  });

  it('insights do período renderizam os agregados reais quando há dados', () => {
    h.insights.mockReturnValue({
      data: { total: 12, negativePct: 25, topNegativeDepartment: 'Suporte', avgSentimentScore: 61.4 },
    });
    render(<AIQuickAccess />);
    const card = screen.getByTestId('ai-insights-card');
    expect(within(card).getByText('12')).toBeInTheDocument();
    expect(within(card).getByText('25%')).toBeInTheDocument();
    expect(within(card).getByText('Suporte')).toBeInTheDocument();
    expect(within(card).getByText('61')).toBeInTheDocument();
  });
});
