/**
 * R2-SLA-001 — o painel de SLA tem 3 estados de verdade: dados, sem dados e ERRO.
 *
 * Antes: falha de consulta e "nenhuma conversa avaliada" caíam no mesmo lugar e a tela
 * pintava 0%/100% como se fosse resultado. Esta prova renderiza o componente REAL nos
 * dois temas (claro e escuro) e confere a saída de cada estado.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let metrics: { data: unknown; loading: boolean } = { data: null, loading: false };

vi.mock('@/hooks/sla/useSLAMetrics', () => ({ useSLAMetrics: () => metrics }));
vi.mock('@/hooks/sla/useSLAHistory', () => ({ useSLAHistory: () => ({ data: null }) }));
vi.mock('@/components/dashboard/sla/SLAConfigTable', () => ({ SLAConfigTable: () => <div data-testid="sla-config" /> }));

import { SLAMetricsDashboard } from '../SLAMetricsDashboard';

// O valor numérico do KpiCard sobe com animação (CountUp fica em '0' no jsdom); com
// "preferir menos movimento" ele renderiza o número direto — é o modo que a tela usa para quem
// pediu menos movimento, então é honesto provar por ele.
window.matchMedia = ((query: string) => ({
  matches: /prefers-reduced-motion/.test(query),
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SLAMetricsDashboard />
    </QueryClientProvider>,
  );
}

const semAmostra = {
  overall: {
    overallRate: 0,
    totalConversations: 12,
    hasSample: false,
    firstResponse: { rate: 0, onTime: 0, breached: 0, pending: 12 },
  },
  byAgent: [],
};

const comAmostra = {
  overall: {
    overallRate: 90,
    totalConversations: 50,
    hasSample: true,
    firstResponse: { rate: 90, onTime: 45, breached: 5, pending: 0 },
  },
  byAgent: [],
};

afterEach(() => {
  document.documentElement.classList.remove('dark');
  metrics = { data: null, loading: false };
});

describe.each([['claro', false], ['escuro', true]] as const)('SLAMetricsDashboard / estados (%s)', (_tema, escuro) => {
  it('ERRO: mostra estado de erro com "Tentar de novo", não "sem dados"', () => {
    if (escuro) document.documentElement.classList.add('dark');
    metrics = { data: null, loading: false };
    renderizar();
    expect(screen.getByTestId('sla-metrics-erro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
    expect(screen.queryByTestId('sla-metrics-sem-dados')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('SEM DADOS: avisa e usa travessão, nunca 0%/100%', () => {
    if (escuro) document.documentElement.classList.add('dark');
    metrics = { data: semAmostra, loading: false };
    renderizar();
    expect(screen.getByTestId('sla-metrics-sem-dados')).toHaveTextContent('Sem dados de SLA no período');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
    // o único número afirmado é o total de conversas com SLA
    expect(screen.getAllByText('12').length).toBeGreaterThanOrEqual(1);
  });

  it('COM DADOS: mostra a taxa real e nenhum aviso', () => {
    if (escuro) document.documentElement.classList.add('dark');
    metrics = { data: comAmostra, loading: false };
    renderizar();
    expect(screen.queryByTestId('sla-metrics-sem-dados')).toBeNull();
    expect(screen.getAllByText('90%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('45').length).toBeGreaterThanOrEqual(1);
  });
});
