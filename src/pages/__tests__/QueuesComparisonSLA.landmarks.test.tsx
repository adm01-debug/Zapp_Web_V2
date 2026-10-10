/**
 * A11Y-03 / A11Y-06 — landmarks e cabeçalho: cada página avulsa renderiza
 * EXATAMENTE um <main> e um <h1>.
 *
 * O <main> de /queues/comparison vive no arquivo da PÁGINA (QueuesComparison.tsx)
 * e o <h1> de /sla/history no dashboard (SLAHistoryDashboard.tsx): só o teste que
 * renderiza a página inteira prova os dois juntos.
 *
 * Teste que falha sem a correção (página sem <main> / dashboard com <h2>) e passa
 * com ela.
 */
import { describe, it, expect, vi } from 'vitest';
import { type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-sintetico' }, loading: false }),
}));

vi.mock('@/hooks/business/useQueuesComparison', () => ({
  useQueuesComparison: () => ({
    queuesPerformance: [
      {
        id: 'q1',
        name: 'Suporte',
        color: '#3B82F6',
        totalContacts: 100,
        assignedContacts: 80,
        waitingContacts: 20,
        totalMessages: 500,
        avgMessagesPerContact: 5,
        agentsCount: 4,
        assignmentRate: 80,
      },
    ],
    loading: false,
  }),
}));

vi.mock('@/hooks/sla/useSLAHistory', () => ({
  useSLAHistory: () => ({
    loading: false,
    data: {
      totals: {
        overallSLARate: 90,
        firstResponseBreaches: 1,
        totalConversations: 10,
        totalBreaches: 2,
      },
      trends: {
        overall: { direction: 'up', percentage: 1 },
        firstResponse: { direction: 'down', percentage: 2 },
      },
      dailyData: [],
      worstDays: [],
      bestDays: [],
    },
  }),
}));

// Gráficos e casca decorativa não fazem parte do alvo (main/h1) e pesam no jsdom.
vi.mock('@/components/queues/QueuesComparisonCharts', () => ({ QueuesComparisonCharts: () => null }));
vi.mock('@/components/sla/SLACharts', () => ({
  SLARateChart: () => null,
  SLAViolationsChart: () => null,
  SLABestWorstDays: () => null,
}));
vi.mock('@/components/layout/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));

import QueuesComparisonPage from '@/pages/QueuesComparison';
import SLAHistoryPage from '@/pages/SLAHistory';

function renderPage(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('a11y: um <main> e um <h1> por página', () => {
  it('QueuesComparison tem exatamente um main e um h1 "Comparação de Filas"', () => {
    renderPage(<QueuesComparisonPage />);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Comparação de Filas' }),
    ).toBeInTheDocument();
  });

  it('SLAHistory tem exatamente um main e um h1 "Histórico de Violações SLA"', () => {
    renderPage(<SLAHistoryPage />);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Histórico de Violações SLA' }),
    ).toBeInTheDocument();
  });
});
