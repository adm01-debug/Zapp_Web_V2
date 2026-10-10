import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

import { AchievementsStatsHeader } from '../AchievementsStats';
import { SpeedTypingGame } from '../MiniGameDialogs';
import { QuizGame } from '../MiniGameDialogs';

function renderizarComQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const conquistasMock = [
  {
    id: 'a1',
    profile_id: 'p1',
    achievement_type: 'fast_response',
    achievement_name: 'Resposta Relâmpago',
    achievement_description: 'Respondeu em menos de 1 minuto',
    xp_earned: 50,
    earned_at: '2026-10-05T12:00:00.000Z',
  },
];

describe('Acessibilidade — barras de progresso das Conquistas', () => {
  it('progress bar de nível tem aria-label com o nome do nível', () => {
    renderizarComQueryClient(
      <AchievementsStatsHeader
        achievements={conquistasMock}
        stats={{ level: 3, xp: 300 }}
      />,
    );

    const progressBar = screen.getByRole('progressbar');
    expect(progressBar).toHaveAttribute('aria-label', 'Progresso para o nível 4');
  });
});

describe('Acessibilidade — mini-games', () => {
  it('barra de precisão do Speed Typing tem aria-label', () => {
    renderizarComQueryClient(<SpeedTypingGame isOpen onClose={() => {}} onComplete={() => {}} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Precisão de digitação');
  });

  it('barra de progresso do Quiz tem aria-label', () => {
    renderizarComQueryClient(<QuizGame isOpen onClose={() => {}} onComplete={() => {}} />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Progresso do quiz');
  });
});