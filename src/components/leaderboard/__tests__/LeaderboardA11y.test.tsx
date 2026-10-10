import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
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
});