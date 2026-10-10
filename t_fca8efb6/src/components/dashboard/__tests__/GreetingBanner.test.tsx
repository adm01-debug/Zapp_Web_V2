import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GreetingBanner } from '../overview/GreetingBanner';

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

const mockUseAgentGamification = vi.fn();
vi.mock('@/hooks/gamification/useAgentGamification', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/gamification/useAgentGamification')>('@/hooks/gamification/useAgentGamification');
  return {
    ...actual,
    useAgentGamification: (...args: unknown[]) => mockUseAgentGamification(...args),
  };
});

function baseStats(overrides: Partial<{ xp: number; level: number; current_streak: number; achievements_count: number }> = {}) {
  return {
    id: 's1',
    profile_id: 'p1',
    xp: 1250,
    level: 5,
    current_streak: 7,
    best_streak: 10,
    messages_sent: 0,
    messages_received: 0,
    conversations_resolved: 0,
    achievements_count: 89,
    avg_response_time_seconds: null,
    customer_satisfaction_score: null,
    ...overrides,
  };
}

describe('GreetingBanner', () => {
  it('com stats: mostra cluster de nível e 3 chips de gamificação', () => {
    mockUseAuth.mockReturnValue({ profile: { name: 'Ana Silva', avatar_url: null } });
    mockUseAgentGamification.mockReturnValue({ stats: baseStats() });
    render(<GreetingBanner />);
    expect(screen.getByText('Nível 5')).toBeInTheDocument();
    expect(screen.getAllByTestId('gami-chip')).toHaveLength(3);
    expect(screen.getByTestId('level-tile')).toBeInTheDocument();
  });

  it('sem stats: só saudação e frase, sem cluster nem chips', () => {
    mockUseAuth.mockReturnValue({ profile: { name: 'Ana Silva', avatar_url: null } });
    mockUseAgentGamification.mockReturnValue({ stats: null });
    render(<GreetingBanner />);
    expect(screen.queryByTestId('level-tile')).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('gami-chip')).toHaveLength(0);
    expect(screen.getByText(/Aqui está o resumo da sua operação hoje\./)).toBeInTheDocument();
  });

  it('saudação usa o primeiro nome do perfil', () => {
    mockUseAuth.mockReturnValue({ profile: { name: 'Ana Silva', avatar_url: null } });
    mockUseAgentGamification.mockReturnValue({ stats: null });
    render(<GreetingBanner />);
    expect(screen.getByText(/Ana!|Ana,/)).toBeInTheDocument();
  });
});
