import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * R2-AUTH-042 (#266) — a view Conquistas (ViewRouter → AchievementsSystem) era
 * alimentada por uma lista fixa de oito conquistas (MOCK_ACHIEVEMENTS): 400 XP,
 * nível 1, três desbloqueadas e "756/1000" conversas resolvidas apareciam para
 * QUALQUER conta, inclusive conta nova sem nenhuma conquista.
 *
 * Este teste renderiza o componente REAL (o mesmo que o ViewRouter monta) com o
 * cliente Supabase mockado e prova que a tela lê agent_stats/agent_achievements
 * do usuário autenticado — e que carregando, ausência real e erro aparecem
 * distintos. Nenhuma conquista simulada pode aparecer.
 */

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: vi.fn(),
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

import { AchievementsSystem } from '../AchievementsSystem';

type Resposta = { data: unknown; error: unknown };

/**
 * Builder thenable do PostgREST: serve tanto para `.maybeSingle()` quanto para a
 * cadeia `.order(...).limit(...)` usada em agent_achievements, em qualquer ordem.
 */
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

interface Cenario {
  profile?: Resposta;
  stats?: Resposta;
  achievements?: Resposta;
}

function responder(cenario: Cenario) {
  mockFrom.mockImplementation((tabela: string) => {
    if (tabela === 'profiles') return consulta(cenario.profile ?? { data: { id: 'p1' }, error: null });
    if (tabela === 'agent_stats') return consulta(cenario.stats ?? { data: null, error: null });
    if (tabela === 'agent_achievements') return consulta(cenario.achievements ?? { data: [], error: null });
    return consulta({ data: [], error: null });
  });
}

function renderizar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AchievementsSystem userId="u1" />
    </QueryClientProvider>,
  );
}

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

const conquistaReal = {
  id: 'a1',
  profile_id: 'p1',
  achievement_type: 'fast_response',
  achievement_name: 'Resposta Relâmpago',
  achievement_description: 'Respondeu em menos de 1 minuto',
  xp_earned: 50,
  earned_at: '2026-10-05T12:00:00.000Z',
};

/** Nomes e números que só existiam na lista fixa antiga. */
const NOMES_SIMULADOS = [
  'Primeiro Contato',
  'Comunicador',
  'Velocista',
  'Maratonista',
  'Favorito dos Clientes',
  'Mestre do Atendimento',
  'Lenda Viva',
  'Flash',
];

function semProgressoSimulado() {
  for (const nome of NOMES_SIMULADOS) {
    expect(screen.queryByText(nome)).toBeNull();
  }
  expect(screen.queryByText('400 XP')).toBeNull();
  expect(screen.queryByText('756/1000')).toBeNull();
}

describe('AchievementsSystem (view Conquistas)', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({ user: { id: 'u1' } });
  });

  it('mostra o desempenho lido da conta autenticada, não a lista fixa', async () => {
    responder({
      stats: { data: statsDaConta, error: null },
      achievements: { data: [conquistaReal], error: null },
    });

    renderizar();

    // A conquista vem de agent_achievements do usuário, com o XP real dela.
    expect(await screen.findByText('Resposta Relâmpago')).toBeInTheDocument();
    expect(screen.getByText('+50 XP')).toBeInTheDocument();
    // Nível/XP do cabeçalho saem de agent_stats (300 XP, nível 3), não dos 400 XP fixos.
    expect(screen.getByText('Nv 3')).toBeInTheDocument();
    expect(screen.getByText('300 XP')).toBeInTheDocument();
    expect(screen.getByText('300 / 450 XP')).toBeInTheDocument();

    semProgressoSimulado();
    expect(mockFrom).toHaveBeenCalledWith('agent_stats');
    expect(mockFrom).toHaveBeenCalledWith('agent_achievements');
  });

  it('conta nova: ausência real de conquistas, nada de progresso simulado', async () => {
    responder({ stats: { data: null, error: null }, achievements: { data: [], error: null } });

    renderizar();

    expect(await screen.findByText('Nenhuma conquista encontrada')).toBeInTheDocument();
    expect(screen.getByText('0 conquistas desbloqueadas')).toBeInTheDocument();
    semProgressoSimulado();
  });

  it('erro na leitura aparece como erro, e não como "zero conquistas"', async () => {
    responder({
      stats: { data: null, error: { message: 'offline' } },
      achievements: { data: null, error: { message: 'offline' } },
    });

    renderizar();

    expect(await screen.findByText('Não foi possível carregar suas conquistas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conquista encontrada')).toBeNull();
    semProgressoSimulado();
  });

  it('mostra carregando enquanto a resposta não chega e troca pelos dados reais', async () => {
    let liberar!: (r: Resposta) => void;
    const pendente = new Promise<Resposta>((resolve) => { liberar = resolve; });

    responder({});
    mockFrom.mockImplementation((tabela: string) => {
      if (tabela === 'profiles') return consulta({ data: { id: 'p1' }, error: null });
      if (tabela === 'agent_stats') return consulta({ data: statsDaConta, error: null });
      if (tabela === 'agent_achievements') return consulta(pendente);
      return consulta({ data: [], error: null });
    });

    renderizar();

    expect(screen.getByText('Carregando conquistas...')).toBeInTheDocument();
    expect(screen.queryByText('Resposta Relâmpago')).toBeNull();

    liberar({ data: [conquistaReal], error: null });

    expect(await screen.findByText('Resposta Relâmpago')).toBeInTheDocument();
    expect(screen.queryByText('Carregando conquistas...')).toBeNull();
    semProgressoSimulado();
  });
});
