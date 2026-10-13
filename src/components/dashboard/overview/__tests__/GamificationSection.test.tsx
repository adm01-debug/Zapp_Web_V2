import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O widget "Conquistas" da visão geral (GamificationSection → renderWidget) era o
 * painel de DEMONSTRAÇÃO (DemoAchievements), que depende de um GamificationProvider
 * que o dashboard NÃO monta: os botões "Resposta < 30s", "Streak 5", etc. não faziam
 * nada. Este teste renderiza o componente REAL da seção, abre a seção colapsada e
 * prova que o widget passa a mostrar as conquistas REAIS da conta autenticada
 * (agent_achievements) — sem nenhum controle morto da demonstração.
 */

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: vi.fn(),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

// Só o widget "Conquistas" (level 3) está visível nesta prova.
vi.mock('@/hooks/analytics/useDashboardWidgets', () => ({
  useDashboardWidgets: () => ({
    visibleWidgets: [
      { id: 'achievements', title: 'Conquistas', type: 'achievements', visible: true, order: 6, size: 'full', level: 3 },
    ],
  }),
}));

import { GamificationSection } from '../GamificationSection';
import type { DashboardStats } from '../../DashboardWidgetRenderer';

type Resposta = { data: unknown; error: unknown };

function consulta(resposta: Resposta | Promise<Resposta>) {
  const promessa = Promise.resolve(resposta);
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => promessa,
    then: (ok: (v: Resposta) => unknown, err?: (e: unknown) => unknown) => promessa.then(ok, err),
  };
  return builder;
}

const statsVazias: DashboardStats = {
  openConversations: 0,
  totalConversations: 0,
  avgResponseTime: null,
  onlineAgents: 0,
  totalAgents: 0,
  resolvedToday: 0,
  pendingConversations: 0,
  queuesStats: [],
  recentActivity: [],
};

const conquistaReal = {
  id: 'a1',
  profile_id: 'p1',
  achievement_type: 'fast_response',
  achievement_name: 'Resposta Relâmpago',
  achievement_description: 'Respondeu em menos de 1 minuto',
  xp_earned: 50,
  earned_at: '2026-10-05T12:00:00.000Z',
};

const statsDaConta = {
  id: 's1',
  profile_id: 'p1',
  xp: 300,
  level: 3,
  current_streak: 2,
  best_streak: 4,
  messages_sent: 12,
  messages_received: 9,
  conversations_resolved: 5,
  achievements_count: 1,
  avg_response_time_seconds: null,
  customer_satisfaction_score: null,
};

function renderizarSecao() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GamificationSection stats={statsVazias} />
    </QueryClientProvider>,
  );
}

describe('GamificationSection — widget Conquistas é real, não demonstração', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
    mockFrom.mockImplementation((tabela: string) => {
      if (tabela === 'profiles') return consulta({ data: { id: 'p1' }, error: null });
      if (tabela === 'agent_stats') return consulta({ data: statsDaConta, error: null });
      if (tabela === 'agent_achievements') return consulta({ data: [conquistaReal], error: null });
      return consulta({ data: [], error: null });
    });
  });

  it('mostra a conquista lida da conta e nenhum controle morto da demonstração', async () => {
    renderizarSecao();

    // A seção nasce colapsada; "Expandir" abre todas as seções.
    fireEvent.click(screen.getByText('Expandir'));

    expect(await screen.findByText('Resposta Relâmpago')).toBeInTheDocument();
    expect(mockFrom).toHaveBeenCalledWith('agent_achievements');

    // Nada do painel de demonstração nem de botões sem efeito.
    expect(screen.queryByText('Sistema de Gamificação')).toBeNull();
    expect(screen.queryByText('Teste as conquistas clicando nos botões abaixo:')).toBeNull();
    expect(screen.queryByText('Resposta < 30s')).toBeNull();
    expect(screen.queryByText('Streak 5')).toBeNull();
    expect(screen.queryByText('Level Up!')).toBeNull();
  });
});
