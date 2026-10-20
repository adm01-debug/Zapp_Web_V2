import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

/**
 * Y07 — mutações de gamificação (`useGamificationMutations`). Cada mutação é um
 * contrato com uma RPC: nome da função, parâmetros e o que a tela recebe. O stub
 * registra a chamada, então parâmetro renomeado/trocado/omitido fica vermelho.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  chamadas: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  respostas: {} as Record<string, { data: unknown; error: { message: string; code?: string } | null }>,
  freio: undefined as undefined | { release: () => void },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      h.chamadas.push({ fn, args });
      const resposta = h.respostas[fn] ?? { data: null, error: null };
      if (h.freio) {
        return new Promise((resolve) => {
          h.freio!.release = () => resolve(resposta);
        });
      }
      return Promise.resolve(resposta);
    },
  },
}));

import { useGamificationMutations } from '@/hooks/gamification/mutations';

const PERFIL = 'perfil-1';

function estado(respostas: Record<string, { data: unknown; error?: { message: string; code?: string } | null }> = {}) {
  h.chamadas = [];
  h.freio = undefined;
  h.respostas = Object.fromEntries(
    Object.entries(respostas).map(([fn, r]) => [fn, { data: r.data, error: r.error ?? null }]),
  );
}

function montar(opts: { profileId?: string } = {}) {
  const profileId = 'profileId' in opts ? opts.profileId : PERFIL;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useGamificationMutations(profileId), { wrapper: Wrapper });
  return { ...hook, invalidate };
}

function chamada(fn: string) {
  return h.chamadas.find((c) => c.fn === fn);
}

describe('useGamificationMutations — XP', () => {
  beforeEach(() => estado());

  it('credita XP pelo perfil e devolve o resultado da RPC', async () => {
    estado({
      add_agent_xp: {
        data: { newXp: 1320, newLevel: 8, previousLevel: 7, leveledUp: true },
      },
    });
    const { result } = montar();

    const retorno = await act(async () => result.current.addXp({ xp: 120, reason: 'mensagem enviada' }));

    expect(chamada('add_agent_xp')?.args).toEqual({ p_profile_id: PERFIL, p_xp: 120 });
    expect(retorno).toEqual({ newXp: 1320, newLevel: 8, leveledUp: true, previousLevel: 7 });
  });

  it('invalida o cache do agente depois de creditar XP', async () => {
    estado({ add_agent_xp: { data: { newXp: 10, newLevel: 2, previousLevel: 1, leveledUp: true } } });
    const { result, invalidate } = montar();

    await act(async () => result.current.addXp({ xp: 10, reason: 'teste' }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent-stats', PERFIL] });
  });

  it('sem perfil a mutação falha antes de tocar o banco', async () => {
    const { result } = montar({ profileId: undefined });

    await expect(result.current.addXp({ xp: 10, reason: 'teste' })).rejects.toThrow('No profile ID');
    expect(h.chamadas).toEqual([]);
  });

  it('sem linha de stats a RPC devolve nulo e a mutação falha em vez de reportar XP', async () => {
    estado({ add_agent_xp: { data: null } });
    const { result } = montar();

    await expect(result.current.addXp({ xp: 10, reason: 'teste' })).rejects.toThrow('No stats found');
  });

  it('erro de RLS da RPC sobe para quem chamou (não é engolido)', async () => {
    estado({ add_agent_xp: { data: null, error: { message: 'permission denied', code: '42501' } } });
    const { result } = montar();

    await expect(result.current.addXp({ xp: 10, reason: 'teste' })).rejects.toMatchObject({ code: '42501' });
  });

  it('expoe o estado "creditando" enquanto a RPC não responde', async () => {
    estado({ add_agent_xp: { data: { newXp: 10, newLevel: 2, previousLevel: 1, leveledUp: false } } });
    h.freio = { release: () => {} };
    const { result } = montar();

    let promessa: Promise<unknown> | undefined;
    await act(async () => { promessa = result.current.addXp({ xp: 10, reason: 'teste' }); });
    await waitFor(() => expect(result.current.isAddingXp).toBe(true));

    await act(async () => { h.freio?.release(); await promessa; });
    await waitFor(() => expect(result.current.isAddingXp).toBe(false));
  });
});

describe('useGamificationMutations — conquistas', () => {
  beforeEach(() => estado());

  it('concede a conquista com a descrição informada', async () => {
    estado({
      grant_agent_achievement: {
        data: { alreadyHad: false, newXp: 1500, newLevel: 9, leveledUp: true },
      },
    });
    const { result } = montar();

    const retorno = await act(async () =>
      result.current.grantAchievement({ type: 'cem_conversas', name: 'Cem conversas', description: 'Resolveu 100', xpReward: 200 }),
    );

    expect(chamada('grant_agent_achievement')?.args).toEqual({
      p_profile_id: PERFIL,
      p_type: 'cem_conversas',
      p_name: 'Cem conversas',
      p_description: 'Resolveu 100',
      p_xp_reward: 200,
    });
    expect(retorno).toEqual({ alreadyHad: false, newXp: 1500, newLevel: 9, leveledUp: true });
  });

  it('sem descrição envia string vazia (o parâmetro é obrigatório no banco)', async () => {
    estado({ grant_agent_achievement: { data: { alreadyHad: false, newXp: 100, newLevel: 2, leveledUp: false } } });
    const { result } = montar();

    await act(async () => result.current.grantAchievement({ type: 't', name: 'T', xpReward: 10 }));

    expect(chamada('grant_agent_achievement')?.args.p_description).toBe('');
  });

  it('conquista já existente é sinalizada e não reporta XP novo', async () => {
    estado({ grant_agent_achievement: { data: { alreadyHad: true } } });
    const { result } = montar();

    const retorno = await act(async () =>
      result.current.grantAchievement({ type: 't', name: 'T', xpReward: 10 }),
    );

    expect(retorno).toEqual({ alreadyHad: true });
  });

  it('invalida stats e conquistas do agente', async () => {
    estado({ grant_agent_achievement: { data: { alreadyHad: true } } });
    const { result, invalidate } = montar();

    await act(async () => result.current.grantAchievement({ type: 't', name: 'T', xpReward: 10 }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent-stats', PERFIL] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent-achievements', PERFIL] });
  });

  it('sem perfil a mutação falha antes de tocar o banco', async () => {
    const { result } = montar({ profileId: undefined });

    await expect(
      result.current.grantAchievement({ type: 't', name: 'T', xpReward: 10 }),
    ).rejects.toThrow('No profile ID');
    expect(h.chamadas).toEqual([]);
  });

  it.todo('conquista com RPC devolvendo nulo é reportada como concedida; addXp/updateStreak falham (mutations.ts:34)');
});

describe('useGamificationMutations — sequência, mensagens e resoluções', () => {
  beforeEach(() => estado());

  it('atualiza a sequência (incremento e quebra) e devolve o recorde', async () => {
    estado({ update_agent_streak: { data: { newStreak: 5, newBestStreak: 9 } } });
    const { result, invalidate } = montar();

    const retorno = await act(async () => result.current.updateStreak(true));

    expect(chamada('update_agent_streak')?.args).toEqual({ p_profile_id: PERFIL, p_increment: true });
    expect(retorno).toEqual({ newStreak: 5, newBestStreak: 9 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent-stats', PERFIL] });
  });

  it('quebrar a sequência também vai como parâmetro explícito', async () => {
    estado({ update_agent_streak: { data: { newStreak: 0, newBestStreak: 9 } } });
    const { result } = montar();

    await act(async () => result.current.updateStreak(false));

    expect(chamada('update_agent_streak')?.args).toEqual({ p_profile_id: PERFIL, p_increment: false });
  });

  it('sequência sem linha de stats falha em vez de reportar zero', async () => {
    estado({ update_agent_streak: { data: null } });
    const { result } = montar();

    await expect(result.current.updateStreak(true)).rejects.toThrow('No stats found');
  });

  it('incrementa mensagens enviadas e recebidas com o tipo pedido', async () => {
    estado({ increment_agent_messages: { data: { newSent: 41, newReceived: 7 } } });
    const { result } = montar();

    const retorno = await act(async () => result.current.incrementMessages('sent'));

    expect(chamada('increment_agent_messages')?.args).toEqual({ p_profile_id: PERFIL, p_type: 'sent' });
    expect(retorno).toEqual({ newSent: 41, newReceived: 7 });
  });

  it('incrementa resoluções sem parâmetro de tipo', async () => {
    estado({ increment_agent_resolutions: { data: { newResolutions: 31 } } });
    const { result, invalidate } = montar();

    const retorno = await act(async () => result.current.incrementResolutions());

    expect(chamada('increment_agent_resolutions')?.args).toEqual({ p_profile_id: PERFIL });
    expect(retorno).toEqual({ newResolutions: 31 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent-stats', PERFIL] });
  });

  it('resoluções sem linha de stats falha em vez de reportar zero', async () => {
    estado({ increment_agent_resolutions: { data: null } });
    const { result } = montar();

    await expect(result.current.incrementResolutions()).rejects.toThrow('No stats found');
  });

  it('nenhuma mutação toca o banco sem perfil', async () => {
    const { result } = montar({ profileId: undefined });

    await expect(result.current.updateStreak(true)).rejects.toThrow('No profile ID');
    await expect(result.current.incrementMessages('received')).rejects.toThrow('No profile ID');
    await expect(result.current.incrementResolutions()).rejects.toThrow('No profile ID');
    expect(h.chamadas).toEqual([]);
  });
});

describe('useGamificationMutations — erros de rede', () => {
  beforeEach(() => estado());

  it('falha de mensagens propaga o erro original', async () => {
    estado({ increment_agent_messages: { data: null, error: { message: 'Failed to fetch' } } });
    const { result } = montar();

    await expect(result.current.incrementMessages('sent')).rejects.toThrow('Failed to fetch');
  });

  it('falha de conquista propaga o erro original', async () => {
    estado({ grant_agent_achievement: { data: null, error: { message: 'timeout' } } });
    const { result } = montar();

    await expect(
      result.current.grantAchievement({ type: 't', name: 'T', xpReward: 10 }),
    ).rejects.toThrow('timeout');
  });

  it('falha de sequência propaga o erro original', async () => {
    estado({ update_agent_streak: { data: null, error: { message: 'permission denied' } } });
    const { result } = montar();

    await expect(result.current.updateStreak(true)).rejects.toThrow('permission denied');
  });
});
