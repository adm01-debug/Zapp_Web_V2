/**
 * `SLAMetricsDashboard` — KPIs, sparklines do histórico e troca de período.
 *
 * O sujeito é a tela REAL; ficam de fora só as três peças irmãs (tabela de
 * agentes, resumo e tabela de configuração — cada uma tem o seu próprio
 * comportamento) e a fronteira de dados (`useSLAMetrics`/`useSLAHistory`), que é
 * dublada para o teste mandar carregando, dado bom e histórico curto. Os cartões
 * de KPI são os de verdade (`overview/DashboardKpiCard`), então o valor, o delta
 * e a sparkline da tela são lidos como o usuário lê.
 *
 * Histórico com menos de 2 dias não desenha sparkline (nenhuma linha para ligar).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  sla: vi.fn(),
  historia: vi.fn(),
}));

vi.mock('@/hooks/sla/useSLAMetrics', () => ({
  useSLAMetrics: (...a: unknown[]) => h.sla(...a),
}));
vi.mock('@/hooks/sla/useSLAHistory', () => ({
  useSLAHistory: (...a: unknown[]) => h.historia(...a),
}));

vi.mock('../sla/SLAAgentTable', () => ({
  SLAAgentTable: ({ agents }: { agents: Array<{ agentName: string }> }) => (
    <div data-testid="tabela-agentes">{agents.map((a) => a.agentName).join('|')}</div>
  ),
}));
vi.mock('../sla/SLASummaryCard', () => ({
  SLASummaryCard: ({ overallRate, onPeriodChange }: { overallRate: number; onPeriodChange: (p: string) => void }) => (
    <div data-testid="resumo">
      <span>{overallRate}%</span>
      <button type="button" onClick={() => onPeriodChange('month')}>
        trocar período
      </button>
    </div>
  ),
}));
vi.mock('../sla/SLAConfigTable', () => ({ SLAConfigTable: () => <div data-testid="config" /> }));

import { SLAMetricsDashboard } from '../SLAMetricsDashboard';

const DADOS = {
  overall: {
    firstResponse: { total: 30, onTime: 25, breached: 5, pending: 3, rate: 83.3 },
    totalConversations: 33,
    hasSample: true,
    overallRate: 83.3,
  },
  byAgent: [
    { agentId: 'a1', agentName: 'Ana', firstResponse: { total: 10, onTime: 10, breached: 0, pending: 0, rate: 100 }, overallRate: 100 },
    { agentId: 'a2', agentName: 'Bia', firstResponse: { total: 20, onTime: 15, breached: 5, pending: 3, rate: 75 }, overallRate: 75 },
  ],
};

const HISTORICO = {
  dailyData: [
    { date: '2026-10-11', slaRate: 80, totalConversations: 10, totalBreaches: 2 },
    { date: '2026-10-12', slaRate: 90, totalConversations: 12, totalBreaches: 1 },
    { date: '2026-10-13', slaRate: 83, totalConversations: 11, totalBreaches: 3 },
  ],
  trends: {
    overall: { direction: 'up' as const, percentage: 12 },
    firstResponse: { direction: 'down' as const, percentage: 20 },
  },
};

function cartaoDoKpi(label: string): HTMLElement {
  const el = screen.getByText(label);
  const card = el.closest('[data-testid="kpi-card"]');
  expect(card).toBeTruthy();
  return card as HTMLElement;
}

beforeEach(() => {
  h.sla.mockReset();
  h.historia.mockReset();
  h.sla.mockReturnValue({ data: DADOS, loading: false });
  h.historia.mockReturnValue({ data: HISTORICO });
});

describe('SLAMetricsDashboard — carregando', () => {
  it('com a leitura em andamento os quatro KPIs mostram "—" (nenhum número inventado)', () => {
    h.sla.mockReturnValue({ data: null, loading: true });
    h.historia.mockReturnValue({ data: undefined });

    render(<SLAMetricsDashboard />);

    const valores = screen.getAllByTestId('kpi-value');
    expect(valores).toHaveLength(4);
    for (const v of valores) expect(v).toHaveTextContent('—');
  });
});

describe('SLAMetricsDashboard — dados do período', () => {
  it('mostra a taxa arredondada, no prazo, violações e total, e repassa os agentes', async () => {
    render(<SLAMetricsDashboard />);

    expect(within(cartaoDoKpi('Taxa Geral SLA')).getByTestId('kpi-value')).toHaveTextContent('83%');
    await waitFor(() =>
      expect(within(cartaoDoKpi('No Prazo')).getByTestId('kpi-value')).toHaveTextContent('25'),
    );
    await waitFor(() =>
      expect(within(cartaoDoKpi('Violações')).getByTestId('kpi-value')).toHaveTextContent('5'),
    );
    await waitFor(() =>
      expect(within(cartaoDoKpi('Total Conversas')).getByTestId('kpi-value')).toHaveTextContent('33'),
    );
    expect(screen.getByTestId('tabela-agentes')).toHaveTextContent('Ana|Bia');
    expect(h.sla).toHaveBeenCalledWith('week');
    expect(h.historia).toHaveBeenCalledWith('30d');
  });

  it('delta vem do histórico: alta da taxa e violação em queda (invertida) com o rótulo da semana', () => {
    render(<SLAMetricsDashboard />);

    // trends.overall (up 12%) alimenta Taxa Geral e No Prazo.
    expect(screen.getAllByText('+12%')).toHaveLength(2);
    // Violações usa trends.firstResponse com invert — queda de 20% aparece como -20%.
    expect(screen.getByText('-20%')).toBeInTheDocument();
    expect(screen.getAllByText('vs. semana anterior').length).toBeGreaterThanOrEqual(3);
  });

  it('sem histórico não desenha sparkline; com 3 dias desenha as quatro linhas', () => {
    h.historia.mockReturnValue({ data: undefined });
    const { unmount } = render(<SLAMetricsDashboard />);
    expect(screen.getAllByTestId('kpi-line-empty')).toHaveLength(4);
    expect(screen.queryAllByTestId('kpi-line')).toHaveLength(0);
    unmount();

    h.historia.mockReturnValue({ data: HISTORICO });
    render(<SLAMetricsDashboard />);
    expect(screen.getAllByTestId('kpi-line')).toHaveLength(4);
    expect(screen.queryAllByTestId('kpi-line-empty')).toHaveLength(0);
  });

  it('um único dia de histórico não vira sparkline (não há linha para ligar)', () => {
    h.historia.mockReturnValue({ data: { ...HISTORICO, dailyData: [HISTORICO.dailyData[0]] } });

    render(<SLAMetricsDashboard />);

    expect(screen.getAllByTestId('kpi-line-empty')).toHaveLength(4);
  });

  it('o seletor de período do resumo refaz a leitura com o período escolhido', async () => {
    render(<SLAMetricsDashboard />);
    expect(h.sla).toHaveBeenLastCalledWith('week');

    fireEvent.click(screen.getByRole('button', { name: 'trocar período' }));

    expect(h.sla).toHaveBeenLastCalledWith('month');
  });
});

describe('SLAMetricsDashboard — caminhos que dependem de outro cartão', () => {
  it.todo(
    'erro de leitura mostra estado de falha, não "100%": hoje `data === null` cai no `?? 100` (t_c9c4999f, sla-paineis-sem-dados)',
  );
  it.todo(
    'período sem conversa avaliada (hasSample=false) mostra "Sem dados" em vez de taxa 0% (t_c9c4999f)',
  );
});
