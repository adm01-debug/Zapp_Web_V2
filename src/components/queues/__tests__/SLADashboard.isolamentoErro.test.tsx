/**
 * Isolamento de erro por bloco no Dashboard de SLA.
 *
 * Comportamento portado da V3 (SectionErrorBoundary): um bloco que falha mostra
 * o aviso no lugar dele em vez de derrubar a tela inteira. O teste renderiza a
 * TELA real e derruba UM bloco (SLAMetricCards, que lança erro) — o cabeçalho,
 * a tabela de agentes e a configuração de SLA têm de continuar na tela.
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

// O bloco de métricas é o único que falha; os demais provam que a tela segue.
vi.mock('../SLAMetricCards', () => ({
  SLAMetricCards: () => {
    throw new Error('falha proposital no bloco de métricas');
  },
}));
vi.mock('../SLAAgentTable', () => ({ SLAAgentTable: () => <div data-testid="bloco-agentes" /> }));
vi.mock('@/components/settings/SLAConfigurationManager', () => ({
  SLAConfigurationManager: () => <div data-testid="bloco-config-global" />,
}));
vi.mock('@/components/settings/SLARulesManager', () => ({
  SLARulesManager: () => <div data-testid="bloco-regras-granulares" />,
}));

import { SLADashboard } from '../SLADashboard';

describe('SLADashboard — isolamento de erro por bloco', () => {
  it('um bloco de métricas que lança erro mostra aviso e não derruba o resto da tela', () => {
    render(<SLADashboard />);

    // O bloco que falhou virou aviso próprio.
    expect(screen.getByText('Erro em "Métricas de SLA"')).toBeInTheDocument();
    // O resto da tela continua de pé.
    expect(screen.getByText('Dashboard de SLA')).toBeInTheDocument();
    expect(screen.getByTestId('bloco-agentes')).toBeInTheDocument();
    expect(screen.getByTestId('bloco-config-global')).toBeInTheDocument();
  });
});
