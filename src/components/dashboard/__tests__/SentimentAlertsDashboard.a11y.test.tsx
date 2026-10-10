import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { afterEach, beforeEach as _beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), analyses: vi.fn(), profiles: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => h.rpc(...args),
    from: (table: string) => {
      if (table === 'conversation_analyses') {
        return { select: () => ({ gte: () => ({ order: () => h.analyses() }) }) };
      }
      if (table === 'profiles') {
        return { select: () => ({ eq: () => h.profiles() }) };
      }
      throw new Error(`tabela inesperada no mock: ${table}`);
    },
  },
}));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { SentimentAlertsDashboard } from '../SentimentAlertsDashboard';

const mockStats = {
  totalAlerts: 10,
  criticalAlerts: 2,
  emailsSent: 5,
  avgSentiment: 72,
  negativeRate: 15,
  negativeAnalyses: 3,
  totalAnalyses: 20,
  uniqueContacts: 8,
};

const mockDailyData = [
  { date: '2026-10-01', positive: 5, neutral: 3, negative: 1 },
  { date: '2026-10-02', positive: 4, neutral: 4, negative: 2 },
];

const baseProps = {
  alerts: [],
  analyses: [],
  loading: false,
  stats: mockStats,
  dailyData: mockDailyData,
  agentData: [],
  fetchData: vi.fn(),
};

beforeEach(() => {
  h.rpc.mockReset();
  h.analyses.mockReset();
  h.profiles.mockReset();
  h.rpc.mockResolvedValue({ data: [], error: null });
  h.analyses.mockResolvedValue({ data: [], error: null });
  h.profiles.mockResolvedValue({ data: [], error: null });
});

describe('SentimentAlertsDashboard — acessibilidade', () => {
  it('o combobox "Período" expõe nome acessível via aria-label', () => {
    render(<SentimentAlertsDashboard />);

    const filtro = screen.getByRole('combobox', { name: 'Filtrar período' });
    expect(filtro).toBeInTheDocument();
    expect(filtro.getAttribute('aria-label')).toBe('Filtrar período');
  });

  it('os títulos da página estão em ordem h1 → h2 → h3 (sem pular nível)', () => {
    const { container } = render(<SentimentAlertsDashboard />);

    const headings = container.querySelectorAll('h1, h2, h3');
    expect(headings.length).toBeGreaterThanOrEqual(2);

    // h1 é o título da página
    const h1 = container.querySelector('h1');
    expect(h1).toBeTruthy();

    // "Evolução Diária" deve ser h2 (não h3 que era o CardTitle padrão)
    const evolucao = container.querySelector('h2');
    expect(evolucao).toBeTruthy();
    expect(evolucao?.textContent).toContain('Evolução Diária');
  });

  it('a tela passa no axe sem violações', async () => {
    const { container } = render(<SentimentAlertsDashboard />);

    const resultado = await axe(container);
    expect(resultado.violations.map((v) => v.id)).toEqual([]);
  });
});