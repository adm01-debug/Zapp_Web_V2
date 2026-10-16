import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * CA-1/CA-2 — conquista e nível chegam ao vivo pelo `useAgentCelebrations`.
 *
 * O hook assina SÓ `agent_stats` (UPDATE/qualquer evento) do PRÓPRIO perfil, num
 * tópico exclusivo por instância, e emite UM evento por conquista nova ou aumento
 * de nível. `agent_achievements` NÃO é assinada: ela não está publicada em
 * `supabase_realtime`, então assiná-la seria uma inscrição morta (o ESPELHO DO CI
 * recusa). A conquista nova chega pelo aumento de `achievements_count` no
 * `agent_stats` — o `grant_agent_achievement` insere a linha e incrementa o
 * contador na MESMA transação — e o hook relê a janela de conquistas para
 * descobrir qual linha é nova. Ao reconectar, ele ressincroniza e emite o que
 * passou longe — sem repetir o que já foi celebrado.
 */

type Row = Record<string, unknown>;
type Resposta = { data: unknown; error: { message: string } | null };
type Handler = (payload: { new?: Row }) => void;

const h = vi.hoisted(() => ({
  perfis: { data: { id: 'p1' }, error: null } as Resposta,
  stats: { data: { id: 's1', profile_id: 'p1', xp: 100, level: 3, achievements_count: 2 }, error: null } as Resposta,
  conquistas: { data: [] as Row[], error: null } as Resposta,
  topicos: [] as string[],
  onChamadas: [] as Array<{ event: string; config: Record<string, unknown> }>,
  handlers: new Map<string, Handler>(),
  statusCallback: undefined as undefined | ((status: string) => void),
  consultas: [] as string[],
  removeChannel: vi.fn(),
}));

function respostaDe(tabela: string): Resposta {
  if (tabela === 'profiles') return h.perfis;
  if (tabela === 'agent_stats') return h.stats;
  return h.conquistas;
}

vi.mock('@/integrations/supabase/client', () => {
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
    subscribe: (cb: (status: string) => void) => {
      h.statusCallback = cb;
      return canal;
    },
  };
  return {
    supabase: {
      channel: (topico: string) => {
        h.topicos.push(topico);
        return canal;
      },
      removeChannel: (...args: unknown[]) => h.removeChannel(...args),
      from: (tabela: string) => builder(tabela),
    },
  };
});

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

import { useAgentCelebrations } from '@/hooks/gamification/useAgentCelebrations';

function criarWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function conquista(overrides: Row = {}): Row {
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

function statsEvento(overrides: Row = {}): Row {
  return { profile_id: 'p1', level: 3, xp: 100, achievements_count: 2, ...overrides };
}

async function montar(opcoes: { profileId?: string; onCelebration?: (c: unknown) => void } = {}) {
  const hook = renderHook(
    () => useAgentCelebrations(opcoes as Parameters<typeof useAgentCelebrations>[0]),
    { wrapper: criarWrapper() },
  );
  await waitFor(() => expect(h.topicos.length).toBeGreaterThan(0));
  return hook;
}

describe('useAgentCelebrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.perfis = { data: { id: 'p1' }, error: null };
    h.stats = { data: { id: 's1', profile_id: 'p1', xp: 100, level: 3, achievements_count: 2 }, error: null };
    h.conquistas = { data: [], error: null };
    h.topicos = [];
    h.onChamadas = [];
    h.handlers = new Map<string, Handler>();
    h.statusCallback = undefined;
    h.consultas = [];
  });

  it('assina SÓ agent_stats do próprio perfil num tópico exclusivo (agent_achievements não é publicada)', async () => {
    const { unmount } = await montar();

    expect(h.topicos[0]).toMatch(/^agente-celebracoes:/);
    // UMA inscrição, e é no sinal publicado.
    expect(h.handlers.size).toBe(1);
    expect(h.onChamadas).toHaveLength(1);
    expect(h.onChamadas[0]).toEqual(
      expect.objectContaining({
        event: 'postgres_changes',
        config: expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'agent_stats',
          filter: 'profile_id=eq.p1',
        }),
      }),
    );
    expect(h.handlers.has('agent_achievements')).toBe(false);

    unmount();
    expect(h.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('conquista nova chega pelo aumento de achievements_count e vira 1 evento; o replay não repete', async () => {
    const celebradas: unknown[] = [];
    const { result } = await montar({ onCelebration: (c) => celebradas.push(c) });
    h.conquistas = { data: [conquista()], error: null };

    await act(async () => {
      h.handlers.get('agent_stats')?.({ new: statsEvento({ achievements_count: 3, xp: 150 }) });
      h.handlers.get('agent_stats')?.({ new: statsEvento({ achievements_count: 3, xp: 150 }) });
    });

    await waitFor(() => expect(result.current.celebrations).toHaveLength(1));
    expect(result.current.celebrations[0]).toMatchObject({
      kind: 'achievement',
      id: 'a9',
      name: 'Marco de 500 mensagens',
      xpEarned: 50,
    });
    expect(celebradas).toHaveLength(1);
  });

  it('aumento de contagem sem linha nova na janela não celebra', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));

    // O contador subiu mas a janela continua vazia: nada a celebrar.
    await act(async () => {
      h.handlers.get('agent_stats')?.({ new: statsEvento({ achievements_count: 3, xp: 150 }) });
    });

    await waitFor(() => expect(h.consultas.filter((t) => t === 'agent_achievements').length).toBeGreaterThan(1));
    expect(result.current.celebrations).toHaveLength(0);
  });

  it('conquista que já existia antes de assinar não vira evento', async () => {
    h.conquistas = { data: [conquista({ id: 'a1' })], error: null };
    const { result } = await montar();
    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));

    // Contador sobe mas a janela só tem a conquista velha (id já conhecido).
    await act(async () => {
      h.handlers.get('agent_stats')?.({ new: statsEvento({ achievements_count: 3, xp: 150 }) });
    });

    await waitFor(() => expect(h.consultas.filter((t) => t === 'agent_achievements').length).toBeGreaterThan(1));
    expect(result.current.celebrations).toHaveLength(0);
  });

  it('aumento de nível vira 1 evento; nível já conhecido não repete', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));

    await act(async () => {
      h.handlers.get('agent_stats')?.({ new: statsEvento({ level: 4, xp: 240 }) });
    });
    expect(result.current.celebrations).toHaveLength(1);
    expect(result.current.celebrations[0]).toMatchObject({
      kind: 'level_up',
      level: 4,
      previousLevel: 3,
      xp: 240,
    });

    await act(async () => {
      h.handlers.get('agent_stats')?.({ new: statsEvento({ level: 4, xp: 300 }) });
      // nível que não subiu (mesmo valor repetido do servidor) não celebra
      h.handlers.get('agent_stats')?.({ new: statsEvento({ level: 3, xp: 300 }) });
    });
    expect(result.current.celebrations).toHaveLength(1);
  });

  it('reconectar ressincroniza e emite o que passou longe, sem repetir', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));

    const consultasConquistas = () => h.consultas.filter((t) => t === 'agent_achievements').length;
    await waitFor(() => expect(consultasConquistas()).toBe(1));

    // Cai a conexão e, enquanto isso, o servidor concede conquista e sobe o nível.
    act(() => h.statusCallback?.('CHANNEL_ERROR'));
    h.conquistas = { data: [conquista({ id: 'a2' })], error: null };
    h.stats = { data: { id: 's1', profile_id: 'p1', xp: 300, level: 4, achievements_count: 3 }, error: null };
    act(() => h.statusCallback?.('SUBSCRIBED'));

    await waitFor(() => expect(consultasConquistas()).toBe(2));
    await waitFor(() => expect(result.current.celebrations).toHaveLength(2));
    expect(result.current.celebrations.map((c) => c.kind).sort()).toEqual(['achievement', 'level_up']);

    // Segunda reconexão: nada novo, nada repetido.
    act(() => h.statusCallback?.('CHANNEL_ERROR'));
    act(() => h.statusCallback?.('SUBSCRIBED'));
    await waitFor(() => expect(consultasConquistas()).toBe(3));
    expect(result.current.celebrations).toHaveLength(2);
  });

  it('dismiss tira da fila sem deixar a conquista voltar', async () => {
    const { result } = await montar();
    h.conquistas = { data: [conquista({ id: 'a7' })], error: null };

    await act(async () => {
      h.handlers.get('agent_stats')?.({ new: statsEvento({ achievements_count: 3, xp: 150 }) });
    });
    await waitFor(() => expect(result.current.celebrations).toHaveLength(1));

    await act(async () => {
      result.current.dismiss();
    });
    expect(result.current.celebrations).toHaveLength(0);

    // Contador sobe de novo mas a janela só tem a conquista já dispensada.
    await act(async () => {
      h.handlers.get('agent_stats')?.({ new: statsEvento({ achievements_count: 4, xp: 200 }) });
    });

    await waitFor(() => expect(h.consultas.filter((t) => t === 'agent_achievements').length).toBeGreaterThan(2));
    expect(result.current.celebrations).toHaveLength(0);
  });
});
