import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamHighlightCard } from '../overview/TeamHighlightCard';
import type { LeaderboardAgent } from '@/hooks/gamification/useLeaderboard';

function agent(overrides: Partial<LeaderboardAgent> = {}): LeaderboardAgent {
  return {
    id: '1', profile_id: 'p1', name: 'João Silva', avatar: undefined, xp: 100, level: 2, streak: 3,
    messagesHandled: 20, conversationsResolved: 12, avgResponseTime: 90, satisfaction: 95, rank: 1,
    previousRank: 1, achievements: [], achievementsCount: 2, isOnline: true,
    ...overrides,
  };
}

describe('TeamHighlightCard', () => {
  it('sem agentes, mostra "Sem dados de equipe"', () => {
    render(<TeamHighlightCard agents={[]} timeRange="week" onTimeRangeChange={vi.fn()} slaRateByAgent={new Map()} />);
    expect(screen.getByText('Sem dados de equipe')).toBeInTheDocument();
  });

  it('renderiza até 4 linhas com resolvidas e % SLA quando disponível', () => {
    const agents = [
      agent({ id: '1', profile_id: 'p1', name: 'João', conversationsResolved: 12 }),
      agent({ id: '2', profile_id: 'p2', name: 'Maria', conversationsResolved: 20 }),
    ];
    render(<TeamHighlightCard agents={agents} timeRange="week" onTimeRangeChange={vi.fn()} slaRateByAgent={new Map([['p1', 98]])} />);
    expect(screen.getAllByTestId('team-row')).toHaveLength(2);
    expect(screen.getByText('12 resolvidas')).toBeInTheDocument();
    expect(screen.getByText('20 resolvidas')).toBeInTheDocument();
    expect(screen.getByText('98% SLA')).toBeInTheDocument();
  });

  it('sem SLA para o agente, mostra travessão em vez de quebrar', () => {
    render(<TeamHighlightCard agents={[agent()]} timeRange="week" onTimeRangeChange={vi.fn()} slaRateByAgent={new Map()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('medalhas usam os tokens rank-gold/rank-silver/rank-bronze (sem HSL cravado)', () => {
    const agents = [
      agent({ id: '1', profile_id: 'p1', name: 'Primeiro' }),
      agent({ id: '2', profile_id: 'p2', name: 'Segundo' }),
      agent({ id: '3', profile_id: 'p3', name: 'Terceiro' }),
    ];
    const { container } = render(<TeamHighlightCard agents={agents} timeRange="week" onTimeRangeChange={vi.fn()} slaRateByAgent={new Map()} />);
    expect(container.querySelector('.text-rank-gold')).not.toBeNull();
    expect(container.querySelector('.text-rank-silver')).not.toBeNull();
    expect(container.querySelector('.text-rank-bronze')).not.toBeNull();
    expect(container.innerHTML).not.toContain('18_38');
  });
});
