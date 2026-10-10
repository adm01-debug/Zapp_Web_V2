import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { axe } from 'vitest-axe';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/hooks/gamification/useLeaderboard', () => ({
  useLeaderboard: () => ({
    agents: [],
    isLoading: false,
    isRefreshing: false,
    timeRange: 'today',
    setTimeRange: vi.fn(),
    handleRefresh: vi.fn(),
  }),
}));

import { Leaderboard } from '../Leaderboard';

function renderizarComQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('Acessibilidade — Ranking', () => {
  it('botão de atualizar ranking tem nome acessível via aria-label', () => {
    renderizarComQueryClient(<Leaderboard />);

    expect(screen.getByRole('button', { name: 'Atualizar ranking' })).toBeInTheDocument();
  });

  it('axe: nome do botão de ícone zerado (button-name / aria-progressbar-name / color-contrast)', async () => {
    const { container } = renderizarComQueryClient(<Leaderboard />);

    const resultados = await axe(container, {
      runOnly: { type: 'rule', values: ['aria-progressbar-name', 'button-name', 'color-contrast'] },
    });
    const cobertas = new Set(
      [...resultados.passes, ...resultados.incomplete, ...resultados.inapplicable].map((r) => r.id),
    );
    expect(cobertas.has('button-name')).toBe(true);
    expect(resultados.violations).toHaveLength(0);
    expect(resultados).toHaveNoViolations();
  });
});
