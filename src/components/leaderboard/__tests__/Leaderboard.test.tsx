import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LeaderboardAgent } from '@/hooks/gamification/useLeaderboard';

// Estado do hook controlado pelo teste: o componente REAL e renderizado, so a
// leitura de dados e substituida por um valor fixo (nada de mock que ja traz a resposta).
const setTimeRange = vi.hoisted(() => vi.fn());
const handleRefresh = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  agents: [] as LeaderboardAgent[],
  isLoading: false,
  isRefreshing: false,
  timeRange: 'week' as 'today' | 'week' | 'month',
}));

vi.mock('@/hooks/gamification/useLeaderboard', () => ({
  useLeaderboard: () => ({
    agents: state.agents,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    timeRange: state.timeRange,
    setTimeRange,
    handleRefresh,
  }),
}));

import { Leaderboard } from '../Leaderboard';

function agente(overrides: Partial<LeaderboardAgent> = {}): LeaderboardAgent {
  return {
    id: 'a1',
    profile_id: 'p1',
    name: 'Ana',
    xp: 100,
    level: 3,
    streak: 1,
    messagesHandled: 10,
    conversationsResolved: 5,
    avgResponseTime: 60,
    satisfaction: 90,
    rank: 1,
    previousRank: 1,
    achievements: [],
    achievementsCount: 0,
    isOnline: true,
    ...overrides,
  };
}

describe('Leaderboard — controles acessiveis e sem botao morto', () => {
  beforeEach(() => {
    state.agents = [];
    state.isLoading = false;
    state.isRefreshing = false;
    state.timeRange = 'week';
    setTimeRange.mockReset();
    handleRefresh.mockReset();
  });

  it('o botao de atualizar tem nome acessivel e dispara o refresh', () => {
    render(<Leaderboard />);

    const atualizar = screen.getByRole('button', { name: 'Atualizar ranking' });
    fireEvent.click(atualizar);

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });

  it('os botoes de periodo marcam o periodo ativo com aria-pressed', () => {
    state.timeRange = 'week';
    render(<Leaderboard />);

    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(setTimeRange).toHaveBeenCalledWith('today');
  });

  it('nao existe o botao morto "Ver ranking completo" (sem onClick)', () => {
    state.agents = [agente()];
    render(<Leaderboard />);

    expect(screen.queryByRole('button', { name: /Ver ranking completo/i })).toBeNull();
  });
});
