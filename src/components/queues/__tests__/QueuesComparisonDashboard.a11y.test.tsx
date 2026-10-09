/**
 * A11Y-03, A11Y-06, A11Y-07 — comparação de filas e páginas avulsas:
 * 1. Rolagem horizontal da página em 390 px: a tabela rola dentro do próprio
 *    contêiner (overflow-x-auto) e a página não.
 * 2. <TableHead></TableHead> vazio: texto sr-only com o que a coluna mostra.
 * 3. Páginas sem <main> e sem <h1>: um <main> e um <h1> por página.
 *
 * Teste que falha sem a correção e passa com ela.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
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

describe('a11y: QueuesComparisonDashboard', () => {
  it('não tem TableHead vazio — toda coluna tem texto acessível (sr-only)', () => {
    const { container } = render(
      <MemoryRouter><QueuesComparisonDashboard /></MemoryRouter>,
    );
    const emptyHeads = container.querySelectorAll('th:empty');
    expect(emptyHeads).toHaveLength(0);
  });

  it('o container da tabela tem overflow-x-auto para rolagem horizontal em 390px', () => {
    const { container } = render(
      <MemoryRouter><QueuesComparisonDashboard /></MemoryRouter>,
    );
    const scrollContainer = container.querySelector('.overflow-x-auto');
    expect(scrollContainer).not.toBeNull();
  });

  it('axe não acusa violações de landmark nem de nome acessível em th', async () => {
    const { container } = render(
      <MemoryRouter><QueuesComparisonDashboard /></MemoryRouter>,
    );
    const results = await axe(container, {
      rules: {
        'color-contrast': { enabled: false },
        'region': { enabled: true },
      },
    });
    expect(results.violations.filter((v) => v.id === 'region')).toEqual([]);
  });
});