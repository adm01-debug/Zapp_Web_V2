/**
 * A11Y-03 / A11Y-06 — comparação de filas: a tabela rola dentro do próprio
 * contêiner em 390px (overflow-x-auto) e nenhuma coluna fica sem nome acessível
 * (o <TableHead> da coluna de ações tem texto sr-only).
 *
 * O landmark (<main>) e o <h1> vivem fora deste componente — na página e no
 * dashboard — e são provados no teste de PÁGINA:
 * src/pages/__tests__/QueuesComparisonSLA.landmarks.test.tsx.
 *
 * Teste que falha sem a correção e passa com ela.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueuesComparisonDashboard } from '../QueuesComparisonDashboard';

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

function renderDashboard() {
  return render(
    <MemoryRouter><QueuesComparisonDashboard /></MemoryRouter>,
  );
}

describe('a11y: QueuesComparisonDashboard', () => {
  it('não tem TableHead vazio — toda coluna tem texto acessível', () => {
    const { container } = renderDashboard();
    expect(container.querySelectorAll('th:empty')).toHaveLength(0);
  });

  it('a coluna de ações tem nome acessível "Ações"', () => {
    renderDashboard();
    expect(screen.getByRole('columnheader', { name: 'Ações' })).toBeInTheDocument();
  });

  it('o container da tabela tem overflow-x-auto para rolar em 390px', () => {
    const { container } = renderDashboard();
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull();
  });
});
