import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * CA-1/CA-2 — conquista e nível chegam ao vivo pelo `useAgentCelebrations`.
 *
 * Refazer de c26046478 (entrega t_8e0d9185, f037b539b), recusada no ESPELHO DO
 * CI porque assinava `agent_achievements` — tabela fora da publicação
 * `supabase_realtime`, logo assinatura morta. Aqui só `agent_stats` é assinado
 * (a guarda do CI recusa assinatura fora da publicação — lá ela seria morta,
 * sem evento nenhum). A conquista nova chega pelo aumento
 * de `achievements_count`, gravado na mesma transação do insert da conquista
 * no servidor: o hook relê a janela e celebra só o id novo.
 * Nível chega direto pelo evento de `agent_stats`, num tópico exclusivo por
 * instância. Ao reconectar, ele ressincroniza e emite o que passou longe —
 * sem repetir o que já foi celebrado.
 *
 * O backend é simulado (canal do Supabase), mas o hook é o real.
 */

type Row = Record<string, unknown>;
type Resposta = { data: unknown; error: { message: string } | null };
type Handler = (payload: { new?: Row }) => void;

const h = vi.hoisted(() => ({
  perfis: { data: { id: 'p1' }, error: null } as Resposta,
  stats: {
    data: { id: 's1', profile_id: 'p1', xp: 100, level: 3, achievements_count: 2 },
    error: null,
  } as Resposta,
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

async function montar(opcoes: { profileId?: string; onCelebration?: (c: unknown) => void } = {}) {
  const hook = renderHook(
    () => useAgentCelebrations(opcoes as Parameters<typeof useAgentCelebrations>[0]),
    { wrapper: criarWrapper() },
  );
  await waitFor(() => expect(h.topicos.length).toBeGreaterThan(0));
  // Barreira da semeadura: só entrega evento depois que o hook leu ids de
  // conquista, nível e contagem atuais (sem isso a ordem seria corrida).
  await waitFor(() => {
    expect(h.consultas).toContain('agent_achievements');
    expect(h.consultas).toContain('agent_stats');
  });
  return hook;
}

/** O que o banco passa a devolver na próxima leitura da janela de conquistas. */
function janelaDeConquistas(...linhas: Row[]) {
  h.conquistas = { data: linhas, error: null };
}

/**
 * Evento real de conquista: o insert da conquista e o aumento de
 * `achievements_count` em `agent_stats` saem na mesma transação, e é o evento
 * publicado quem avisa o cliente a reler a janela de conquistas.
 */
async function entregarConquista(stats: Row = {}) {
  await act(async () => {
    h.handlers.get('agent_stats')?.({
      new: { id: 's1', profile_id: 'p1', xp: 100, level: 3, achievements_count: 3, ...stats },
    });
  });
}

describe('useAgentCelebrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.perfis = { data: { id: 'p1' }, error: null };
    h.stats = {
      data: { id: 's1', profile_id: 'p1', xp: 100, level: 3, achievements_count: 2 },
      error: null,
    };
    h.conquistas = { data: [], error: null };
    h.topicos = [];
    h.onChamadas = [];
    h.handlers = new Map<string, Handler>();
    h.statusCallback = undefined;
    h.consultas = [];
  });

  it('assina só agent_stats do próprio perfil num tópico exclusivo', async () => {
    const { unmount } = await montar();

    expect(h.topicos[0]).toMatch(/^agente-celebracoes:/);
    expect(h.onChamadas.map((c) => c.config.table)).toEqual(['agent_stats']);
    expect(h.handlers.has('agent_achievements')).toBe(false);
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

    unmount();
    expect(h.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('conquista nova vira 1 evento pelo sinal da contagem, e o replay não repete', async () => {
    const celebradas: unknown[] = [];
    const { result } = await montar({ onCelebration: (c) => celebradas.push(c) });

    janelaDeConquistas(conquista());
    await entregarConquista();

    expect(result.current.celebrations).toHaveLength(1);
    expect(result.current.celebrations[0]).toMatchObject({
      kind: 'achievement',
      id: 'a9',
      name: 'Marco de 500 mensagens',
      xpEarned: 50,
    });
    expect(celebradas).toHaveLength(1);

    // Replay do mesmo evento (mesma contagem): não relê nem repete.
    const leituras = h.consultas.filter((t) => t === 'agent_achievements').length;
    await entregarConquista();
    expect(h.consultas.filter((t) => t === 'agent_achievements')).toHaveLength(leituras);
    expect(result.current.celebrations).toHaveLength(1);
    expect(celebradas).toHaveLength(1);
  });

  it('contagem de conquistas que não sobe não relê nem celebra', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));
    const leiturasAntes = h.consultas.filter((t) => t === 'agent_achievements').length;
    janelaDeConquistas(conquista());

    await act(async () => {
      h.handlers.get('agent_stats')?.({
        new: { id: 's1', profile_id: 'p1', xp: 130, level: 3, achievements_count: 2 },
      });
    });

    expect(result.current.celebrations).toHaveLength(0);
    expect(h.consultas.filter((t) => t === 'agent_achievements')).toHaveLength(leiturasAntes);
  });

  it('conquista que já existia antes de assinar não vira evento', async () => {
    janelaDeConquistas(conquista({ id: 'a1' }));
    const { result } = await montar();
    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));

    // Contagem sobe (outra origem), mas a janela só tem o id já conhecido.
    await act(async () => {
      h.handlers.get('agent_stats')?.({
        new: { id: 's1', profile_id: 'p1', xp: 100, level: 3, achievements_count: 3 },
      });
    });

    expect(result.current.celebrations).toHaveLength(0);
  });

  it('semeadura celebra só o que nasceu depois de montar (corrida com o insert)', async () => {
    // A leitura inicial pode ver uma conquista gravada DEPOIS de montar (o
    // insert comitou antes do SELECT responder): ela vira festa, e o que já
    // existia continua suprimido. earned_at futuro garante posterioridade ao
    // marco capturado no efeito, sem depender de relógio.
    const depois = new Date(Date.now() + 60_000).toISOString();
    janelaDeConquistas(
      conquista({ id: 'a-antiga', earned_at: '2026-10-13T10:00:00.000Z' }),
      conquista({ id: 'a-nova', earned_at: depois }),
    );
    const { result } = await montar();

    await waitFor(() => expect(result.current.celebrations).toHaveLength(1));
    expect(result.current.celebrations[0]).toMatchObject({ kind: 'achievement', id: 'a-nova' });
  });

  it('relógio do cliente levemente atrasado não transforma conquista antiga em festa', async () => {
    // earned_at é do servidor; com o cliente ~1 s atrás, uma conquista de instantes
    // antes do mount parece "posterior" ao marco. A tolerância de 2 s a suprime.
    const quaseAgora = new Date(Date.now() + 1_000).toISOString();
    janelaDeConquistas(conquista({ id: 'a-antiga-skew', earned_at: quaseAgora }));
    const { result } = await montar();

    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));
    expect(result.current.celebrations).toHaveLength(0);
  });

  it('aumento de nível vira 1 evento; nível já conhecido não repete', async () => {
    const { result } = await montar();
    await waitFor(() => expect(result.current.celebrations).toHaveLength(0));

    await act(async () => {
      h.handlers.get('agent_stats')?.({
        new: { id: 's1', profile_id: 'p1', level: 4, xp: 240, achievements_count: 2 },
      });
    });
    expect(result.current.celebrations).toHaveLength(1);
    expect(result.current.celebrations[0]).toMatchObject({
      kind: 'level_up',
      level: 4,
      previousLevel: 3,
      xp: 240,
    });

    await act(async () => {
      h.handlers.get('agent_stats')?.({
        new: { id: 's1', profile_id: 'p1', level: 4, xp: 300, achievements_count: 2 },
      });
      // nível que não subiu (mesmo valor repetido do servidor) não celebra
      h.handlers.get('agent_stats')?.({
        new: { id: 's1', profile_id: 'p1', level: 3, xp: 300, achievements_count: 2 },
      });
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
    janelaDeConquistas(conquista({ id: 'a2' }));
    h.stats = {
      data: { id: 's1', profile_id: 'p1', xp: 300, level: 4, achievements_count: 3 },
      error: null,
    };
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

    janelaDeConquistas(conquista({ id: 'a7' }));
    await entregarConquista({ achievements_count: 3 });
    expect(result.current.celebrations).toHaveLength(1);

    await act(async () => {
      result.current.dismiss();
    });
    expect(result.current.celebrations).toHaveLength(0);

    // Contagem sobe de novo, mas a janela só tem o id já celebrado: não volta.
    await entregarConquista({ achievements_count: 4 });
    expect(result.current.celebrations).toHaveLength(0);
  });
});
