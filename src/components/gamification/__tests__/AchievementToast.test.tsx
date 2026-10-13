import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O host do toast de gamificação mostra, na tela, o que o `useAgentCelebrations`
 * entrega: conquista nova (nome, descrição e XP) e subida de nível (anterior, novo e
 * XP), um por vez, dispensável e anunciado em `aria-live="polite"`.
 *
 * O backend é simulado (canal do Supabase), mas o componente e o hook são os reais —
 * o teste não injeta a resposta pronta no toast.
 */

type Resposta = { data: unknown; error: { message: string } | null };
type Handler = (payload: { new?: Record<string, unknown> }) => void;

const prefersReduzido = vi.hoisted(() => ({ valor: false }));

vi.mock('framer-motion', async () => {
  const real = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...real, useReducedMotion: () => prefersReduzido.valor };
});

const h = vi.hoisted(() => ({
  stats: { data: null, error: null } as Resposta,
  conquistas: { data: [], error: null } as Resposta,
  handlers: new Map<string, Handler>(),
  onChamadas: [] as Array<{ event: string; config: Record<string, unknown> }>,
  consultas: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const respostaDe = (tabela: string) => (tabela === 'agent_stats' ? h.stats : h.conquistas);
  const builder = (tabela: string) => {
    const api = {
      select: () => api,
      eq: () => api,
      order: () => api,
      limit: () => {
        h.consultas.push(tabela);
        return Promise.resolve(respostaDe(tabela));
      },
      maybeSingle: () => {
        h.consultas.push(tabela);
        return Promise.resolve(respostaDe(tabela));
      },
      then: (ok: (v: Resposta) => unknown, err?: (e: unknown) => unknown) => {
        h.consultas.push(tabela);
        return Promise.resolve(respostaDe(tabela)).then(ok, err);
      },
    };
    return api;
  };
  const canal = {
    on: (event: string, config: Record<string, unknown>, cb: Handler) => {
      h.onChamadas.push({ event, config });
      h.handlers.set(String(config.table), cb);
      return canal;
    },
    subscribe: () => canal,
  };
  return {
    supabase: {
      channel: () => canal,
      removeChannel: () => Promise.resolve(),
      from: (tabela: string) => builder(tabela),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

import { AchievementCelebrationToaster } from '@/components/gamification/AchievementToast';

function montar(props: { duration?: number } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <AchievementCelebrationToaster profileId="p1" {...props} />
    </QueryClientProvider>,
  );
}

function conquista(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'a9',
    profile_id: 'p1',
    achievement_type: 'message_milestone',
    achievement_name: 'Marco de 500 mensagens',
    achievement_description: 'Você chegou a 500 mensagens',
    xp_earned: 50,
    earned_at: '2026-10-13T10:00:00.000Z',
    ...overrides,
  };
}

/** Espera o canal estar assinado e o baseline do banco ter sido lido. */
async function pronto() {
  await waitFor(() => expect(h.handlers.size).toBe(2));
  await waitFor(() => expect(h.consultas).toContain('agent_achievements'));
  await waitFor(() => expect(h.consultas).toContain('agent_stats'));
}

async function entregar(tabela: string, payload: { new?: Record<string, unknown> }) {
  await act(async () => {
    h.handlers.get(tabela)?.(payload);
  });
}

describe('AchievementCelebrationToaster', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prefersReduzido.valor = false;
    h.stats = { data: { id: 's1', profile_id: 'p1', xp: 100, level: 3 }, error: null };
    h.conquistas = { data: [], error: null };
    h.handlers = new Map<string, Handler>();
    h.onChamadas = [];
    h.consultas = [];
  });

  it('existe antes de qualquer celebração e anuncia em aria-live polite', () => {
    montar();

    const regiao = screen.getByRole('status');
    expect(regiao).toHaveAttribute('aria-live', 'polite');
    expect(regiao).toHaveAttribute('aria-atomic', 'true');
    expect(regiao).toBeEmptyDOMElement();
  });

  it('conquista nova aparece com nome, descrição e XP', async () => {
    montar();
    await pronto();

    await entregar('agent_achievements', { new: conquista() });

    expect(await screen.findByText('Marco de 500 mensagens')).toBeInTheDocument();
    expect(screen.getByText('Você chegou a 500 mensagens')).toBeInTheDocument();
    expect(screen.getByText('+50 XP')).toBeInTheDocument();
    expect(screen.getByText('Conquista Desbloqueada!')).toBeInTheDocument();
  });

  it('conquista que já existia antes de assinar não vira toast', async () => {
    h.conquistas = { data: [conquista({ id: 'a1' })], error: null };
    montar();
    await pronto();

    await entregar('agent_achievements', { new: conquista({ id: 'a1' }) });

    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('subida de nível mostra nível anterior, novo e XP', async () => {
    montar();
    await pronto();

    await entregar('agent_stats', { new: { profile_id: 'p1', level: 4, xp: 240 } });

    expect(await screen.findByText('Nível 4!')).toBeInTheDocument();
    expect(screen.getByText('Você subiu do nível 3 para o nível 4')).toBeInTheDocument();
    expect(screen.getByText('+240 XP')).toBeInTheDocument();
  });

  it('mostra uma por vez; fechar traz a próxima e não volta', async () => {
    montar();
    await pronto();

    await entregar('agent_achievements', {
      new: conquista({ id: 'a1', achievement_name: 'Primeira conquista' }),
    });
    await entregar('agent_achievements', {
      new: conquista({ id: 'a2', achievement_name: 'Segunda conquista' }),
    });

    expect(await screen.findByText('Primeira conquista')).toBeInTheDocument();
    expect(screen.queryByText('Segunda conquista')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso de conquista' }));

    expect(await screen.findByText('Segunda conquista')).toBeInTheDocument();
    expect(screen.queryByText('Primeira conquista')).not.toBeInTheDocument();
  });

  it('sai sozinho depois do tempo, sem clique', async () => {
    montar({ duration: 300 });
    await pronto();

    await entregar('agent_achievements', { new: conquista() });
    expect(await screen.findByText('Marco de 500 mensagens')).toBeInTheDocument();

    await waitFor(
      () => expect(screen.queryByText('Marco de 500 mensagens')).not.toBeInTheDocument(),
      { timeout: 1500 },
    );
  });

  it('com movimento reduzido não traz confete', async () => {
    prefersReduzido.valor = true;
    montar();
    await pronto();

    await entregar('agent_achievements', { new: conquista() });

    expect(await screen.findByText('Marco de 500 mensagens')).toBeInTheDocument();
    expect(screen.queryByTestId('celebration-particles')).not.toBeInTheDocument();
  });

  it('sem movimento reduzido o confete aparece', async () => {
    montar();
    await pronto();

    await entregar('agent_achievements', { new: conquista() });

    expect(await screen.findByText('Marco de 500 mensagens')).toBeInTheDocument();
    expect(screen.getByTestId('celebration-particles')).toBeInTheDocument();
  });
});
