/**
 * R2-SLA-001 — o Histórico de SLA distingue ERRO de "sem dados" e não afirma taxa sem amostra.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let hist: { data: unknown; loading: boolean } = { data: null, loading: false };

vi.mock('@/hooks/sla/useSLAHistory', () => ({ useSLAHistory: () => hist }));
vi.mock('../SLACharts', () => ({
  SLARateChart: () => null,
  SLAViolationsChart: () => null,
  SLABestWorstDays: () => null,
}));

import { SLAHistoryDashboard } from '../SLAHistoryDashboard';

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SLAHistoryDashboard />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  document.documentElement.classList.remove('dark');
  hist = { data: null, loading: false };
});

const trend = { direction: 'stable', percentage: 0 };
const dados = {
  totals: { overallSLARate: 92, hasSample: true, firstResponseBreaches: 4, totalConversations: 50, totalBreaches: 6 },
  trends: { overall: trend, firstResponse: trend },
  dailyData: [],
  worstDays: [],
  bestDays: [],
};
const semAmostra = {
  totals: { overallSLARate: 0, hasSample: false, firstResponseBreaches: 0, totalConversations: 0, totalBreaches: 0 },
  trends: { overall: trend, firstResponse: trend },
  dailyData: [],
  worstDays: [],
  bestDays: [],
};

describe.each([['claro', false], ['escuro', true]] as const)('SLAHistoryDashboard (%s)', (_tema, escuro) => {
  it('ERRO: estado de erro com "Tentar de novo"', () => {
    if (escuro) document.documentElement.classList.add('dark');
    hist = { data: null, loading: false };
    renderizar();
    expect(screen.getByTestId('sla-history-erro')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument();
    expect(screen.queryByText('Sem dados de SLA no período')).toBeNull();
  });

  it('SEM AMOSTRA: avisa e não mostra 0.0%', () => {
    if (escuro) document.documentElement.classList.add('dark');
    hist = { data: semAmostra, loading: false };
    renderizar();
    expect(screen.getByTestId('sla-history-sem-dados')).toHaveTextContent('Sem dados de SLA no período');
    expect(screen.queryByText('0.0%')).toBeNull();
    // o seletor de período continua disponível
    expect(screen.getByRole('radio', { name: '90 dias' })).toBeInTheDocument();
  });

  it('COM DADOS: mostra a taxa real', () => {
    if (escuro) document.documentElement.classList.add('dark');
    hist = { data: dados, loading: false };
    renderizar();
    expect(screen.queryByTestId('sla-history-sem-dados')).toBeNull();
    expect(screen.getByText('92.0%')).toBeInTheDocument();
  });
});
