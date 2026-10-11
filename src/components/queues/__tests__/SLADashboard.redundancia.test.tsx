/**
 * Redundancia da Visao Geral do SLA (worker design).
 *
 * Na mesma tela a taxa e as contagens de 1a resposta ("no prazo"/"atrasadas")
 * apareciam 3x: no SLAMetricCards e em dois cards proprios da tela
 * ("Visao Geral do SLA" e "Resumo de Violacoes"). O cartao pediu manter a
 * taxa/contagem 1x, no card de metrica. Esta prova confere a SAIDA RENDERIZADA:
 * os titulos redundantes nao existem mais e o unico card extra mostra so o
 * dado que os cards de metrica NAO exibem (avaliadas e pendentes).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('@/hooks/sla/useSLAMetrics', () => ({
  useSLAMetrics: () => ({
    loading: false,
    data: {
      overall: {
        firstResponse: { total: 40, onTime: 34, breached: 6, pending: 9, rate: 85 },
        totalConversations: 49,
        hasSample: true,
        overallRate: 85,
      },
      byAgent: [],
    },
  }),
}));

vi.mock('@/hooks/sla/useSLAHistory', () => ({
  useSLAHistory: () => ({ data: { dailyData: [] } }),
}));

// Filhos pesados: isolam a composicao da tela propria do SLADashboard.
vi.mock('../SLAMetricCards', () => ({ SLAMetricCards: () => <div data-testid="metric-cards" /> }));
vi.mock('../SLAAgentTable', () => ({ SLAAgentTable: () => <div data-testid="agent-table" /> }));
vi.mock('@/components/settings/SLAConfigurationManager', () => ({ SLAConfigurationManager: () => null }));
vi.mock('@/components/settings/SLARulesManager', () => ({ SLARulesManager: () => null }));

import { SLADashboard } from '../SLADashboard';

describe('SLADashboard — 1a resposta nao aparece 3x', () => {
  it('removeu os cards redundantes "Visao Geral do SLA" e "Resumo de Violacoes"', () => {
    render(<SLADashboard />);
    expect(screen.queryByText('Visão Geral do SLA')).toBeNull();
    expect(screen.queryByText('Resumo de Violações')).toBeNull();
    expect(screen.queryByText('Violações 1ª Resposta')).toBeNull();
  });

  it('mostra so o dado ainda nao exibido nos cards de metrica: avaliadas e pendentes', () => {
    render(<SLADashboard />);
    expect(screen.getByText('Conversas avaliadas')).toBeInTheDocument();
    expect(screen.getByText('Pendentes de 1ª resposta')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });
});
