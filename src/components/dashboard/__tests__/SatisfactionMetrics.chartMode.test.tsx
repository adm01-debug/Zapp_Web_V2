import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { format } from 'date-fns';
import { createElement } from 'react';

// DASH-CONTROLS-001 (ponto 2): o select `sat-chart-mode` oferecia "CSAT e NPS"
// e a legenda mostrava a bolinha NPS, mas o gráfico desenhava SÓ a linha CSAT.
// Estes testes provam que a seleção agora desenha a série indicada com dado
// real (nps_surveys). No código anterior `series-NPS` nunca existia → vermelho.

const h = vi.hoisted(() => ({ breakdown: vi.fn(), nps: vi.fn() }));

vi.mock('@/hooks/business/useCSAT', () => ({
  useSatisfactionBreakdown: (...args: unknown[]) => h.breakdown(...args),
}));
vi.mock('@/hooks/business/useNPSSurveys', () => ({
  useNPSSurveys: () => h.nps(),
}));

// recharts não desenha nada no jsdom (ResponsiveContainer mede 0×0); stub leve
// que expõe as séries pedidas e o data passado ao LineChart.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) =>
    createElement('div', { 'data-testid': 'evolution-chart', 'data-series': JSON.stringify(data) }, children),
  Line: ({ dataKey }: { dataKey: string }) => createElement('div', { 'data-testid': `series-${dataKey}` }),
  BarChart: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
}));

// CardSelect é Radix Select; em teste troco por <select> nativo para disparar
// onValueChange com fireEvent.change (padrão dos testes do repo).
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

import { SatisfactionMetrics } from '../SatisfactionMetrics';

const hoje = format(new Date(), 'dd/MM');

const breakdownBase = {
  totalResponses: 2,
  csatPercent: 100,
  previousCsatPercent: null,
  trend: null,
  trendValue: 0,
  distribution: [{ rating: 5, count: 2 }],
  byAgent: [],
  byQueue: [],
  timeline: [
    { date: hoje, csatPercent: 100, responses: 2 },
    { date: format(new Date(Date.now() - 86400000), 'dd/MM'), csatPercent: null, responses: 0 },
  ],
};

beforeEach(() => {
  h.breakdown.mockReturnValue({ data: breakdownBase, isLoading: false, isError: false, refetch: vi.fn() });
  h.nps.mockReturnValue({
    surveys: [
      { id: 'n1', contact_id: 'c1', agent_id: null, score: 10, feedback: null, survey_type: 'manual', created_at: new Date().toISOString() },
      { id: 'n2', contact_id: 'c2', agent_id: null, score: 4, feedback: null, survey_type: 'manual', created_at: new Date().toISOString() },
    ],
  });
});

describe('SatisfactionMetrics — controle de série do gráfico de evolução', () => {
  it('modo "CSAT e NPS" desenha a série NPS com o valor calculado das surveys', () => {
    render(<SatisfactionMetrics />);
    // Antes: só existia series-CSAT mesmo com a legenda NPS visível.
    expect(screen.getByTestId('series-CSAT')).toBeInTheDocument();
    expect(screen.getByTestId('series-NPS')).toBeInTheDocument();
    const data = JSON.parse(screen.getByTestId('evolution-chart').getAttribute('data-series')!);
    // NPS de hoje: (1 promotor − 1 detrator)/2 = 0
    expect(data[0]).toMatchObject({ date: hoje, CSAT: 100, NPS: 0 });
  });

  it('trocar para "Somente CSAT" remove a série NPS e a legenda NPS', () => {
    render(<SatisfactionMetrics />);
    fireEvent.change(screen.getByTestId('sat-chart-mode'), { target: { value: 'csat' } });
    const card = screen.getByTestId('sat-evolution-card');
    expect(within(card).getByTestId('series-CSAT')).toBeInTheDocument();
    expect(within(card).queryByTestId('series-NPS')).not.toBeInTheDocument();
    // a legenda NPS (bolinha verde) também sai — antes ela ficava sem a linha
    expect(within(card).queryByText('NPS', { selector: 'span' })).not.toBeInTheDocument();
  });
});
